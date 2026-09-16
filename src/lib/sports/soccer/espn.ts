import "server-only";

import { isoDateInProjectTz, isoDateOffset } from "@/lib/date";
import { countryCrestUrl } from "./branding";
import { recordFailure, recordSuccess, type SourceId } from "./provider-health";
import {
  COMPETITIONS,
  DEFAULT_COMPETITION,
  type SoccerCompetition,
} from "./competitions";
import type {
  CommentaryLine,
  Lineup,
  Match,
  MatchDetail,
  MatchEvent,
  RecentResult,
  SoccerProvider,
  SoccerStanding,
  SoccerTeam,
  SquadPlayer,
  TeamLeaders,
  TeamProfile,
  TeamStatLine,
} from "./provider";

// ESPN serves the same "site" API from two hosts. Its edge (Akamai) started
// answering 403 "Access Denied" to server-side callers on site.api.espn.com
// from cloud IPs (production went dark on 2026-09-10 while local dev kept
// working); site.web.api.espn.com serves identical payloads and doesn't. We
// lead with the web host and fall back to the other on a 403 either way.
const SITE_HOSTS = [
  "https://site.web.api.espn.com/apis/site/v2/sports/soccer",
  "https://site.api.espn.com/apis/site/v2/sports/soccer",
] as const;
const SITE_ROOT = SITE_HOSTS[0];
const WEB_ROOT = "https://site.web.api.espn.com/apis/v2/sports/soccer";

const ESPN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 TrustMeBro/0.1",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.espn.com/",
};

type FetchOpts = { revalidate?: number };

function alternateHost(base: string): string | null {
  for (const host of SITE_HOSTS) {
    if (base.startsWith(host)) {
      const other = SITE_HOSTS.find((h) => h !== host)!;
      return base.replace(host, other);
    }
  }
  return null;
}

function sourceOf(base: string): SourceId {
  return base.startsWith(SITE_HOSTS[0]) ? "espn-site-web" : "espn-site";
}

async function fetchJson<T>(
  base: string,
  path: string,
  query: Record<string, string | undefined> = {},
  opts: FetchOpts = {},
  retried = false,
): Promise<T> {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: ESPN_HEADERS,
      next: { revalidate: opts.revalidate ?? 60 },
    });
  } catch (err) {
    // A network-level failure on the primary is the same story as a 403.
    const alt = retried ? null : alternateHost(base);
    const message = err instanceof Error ? err.message : String(err);
    if (alt) {
      await recordFailure(sourceOf(alt), `${sourceOf(base)}: ${message}`);
      return fetchJson<T>(alt, path, query, opts, true);
    }
    throw err;
  }

  // The primary host answering 403 or 5xx is exactly how the September
  // outage looked: the other host serves the same payload, so switch and
  // say so, unless this is already the retry.
  if ((res.status === 403 || res.status >= 500) && !retried) {
    const alt = alternateHost(base);
    if (alt) {
      await recordFailure(
        sourceOf(alt),
        `${sourceOf(base)} returned ${res.status} on ${path}`,
      );
      return fetchJson<T>(alt, path, query, opts, true);
    }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const message = `ESPN soccer ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 200)}`;
    // Every other non-ok response still records a failure before throwing --
    // not only 403/5xx. The 2026-09-16 date-range 400 is exactly what this
    // closes: fetchJson used to only ever call recordFailure on the
    // host-switch path above, so a status class it had never seen (400, or
    // a second host also failing after the retry) threw silently and
    // soccer_provider_health stayed green through the whole outage.
    await recordFailure(sourceOf(base), message);
    throw new Error(message);
  }
  // Always report which host actually served it, so a recovery onto the
  // primary is noticed as soon as it happens.
  await recordSuccess(sourceOf(base));
  return res.json() as Promise<T>;
}

function ymd(iso: string): string {
  return iso.replace(/-/g, "").slice(0, 8);
}

type EspnTeam = {
  id: string;
  abbreviation?: string;
  displayName?: string;
  name?: string;
  location?: string;
  logo?: string;
  logos?: Array<{ href?: string }>;
  color?: string;
  alternateColor?: string;
};

function teamFrom(t: EspnTeam, national: boolean): SoccerTeam {
  const abbreviation = t.abbreviation ?? "";
  const logo = t.logo ?? t.logos?.[0]?.href ?? null;
  return {
    id: Number(t.id),
    name: t.displayName ?? t.name ?? t.location ?? "",
    abbreviation,
    country: t.location ?? t.displayName ?? "",
    crest_url: logo ?? (national ? countryCrestUrl(abbreviation) : null),
    color: national ? null : (t.color ?? null),
    alt_color: national ? null : (t.alternateColor ?? null),
  };
}

type EspnEvent = {
  id: string;
  date: string;
  season?: { year?: number; slug?: string };
  status?: {
    clock?: number;
    displayClock?: string;
    period?: number;
    type?: { state?: string; completed?: boolean; description?: string };
  };
  competitions?: Array<{
    date?: string; // the summary endpoint's header carries the date here, not at the top level
    competitors?: Array<{
      homeAway: "home" | "away";
      score?: string;
      winner?: boolean;
      team: EspnTeam;
    }>;
    status?: EspnEvent["status"];
    notes?: Array<{ headline?: string }>;
    venue?: { fullName?: string };
  }>;
};

type EspnStandingEntry = {
  team: EspnTeam;
  stats?: Array<{ name?: string; value?: number }>;
};

type EspnStandings = {
  children?: Array<{
    name?: string;
    standings?: { entries?: EspnStandingEntry[] };
  }>;
};

// Team stats worth showing, in display order. ESPN ships ~20; these read.
const STAT_LABELS: Array<[string, string]> = [
  ["possessionPct", "Possession %"],
  ["totalShots", "Shots"],
  ["shotsOnTarget", "On target"],
  ["wonCorners", "Corners"],
  ["foulsCommitted", "Fouls"],
  ["offsides", "Offsides"],
  ["yellowCards", "Yellow cards"],
  ["redCards", "Red cards"],
  ["saves", "Saves"],
  ["passPct", "Pass accuracy"],
  ["totalPasses", "Passes"],
];

type EspnLastFiveEvent = {
  id: string;
  gameDate: string;
  leagueName?: string;
  competitionName?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamScore?: string;
  awayTeamScore?: string;
  gameResult?: string;
  atVs?: string;
  opponent?: EspnTeam;
};

function recentFrom(e: EspnLastFiveEvent, teamId: number): RecentResult | null {
  const opp = e.opponent;
  if (!opp) return null;
  const home = Number(e.homeTeamId) === teamId;
  const hs = Number(e.homeTeamScore) || 0;
  const as = Number(e.awayTeamScore) || 0;
  const gf = home ? hs : as;
  const ga = home ? as : hs;
  const result: RecentResult["result"] =
    e.gameResult === "W" || e.gameResult === "L" || e.gameResult === "D"
      ? e.gameResult
      : gf > ga
        ? "W"
        : gf < ga
          ? "L"
          : "D";
  return {
    event_id: Number(e.id),
    date: e.gameDate,
    competition_name: e.leagueName ?? e.competitionName ?? "",
    opponent: {
      id: Number(opp.id),
      name: opp.displayName ?? opp.name ?? "",
      abbreviation: opp.abbreviation ?? "",
      crest: opp.logo ?? opp.logos?.[0]?.href ?? null,
    },
    home_away: home ? "H" : "A",
    goals_for: gf,
    goals_against: ga,
    result,
  };
}

function statValue(entry: EspnStandingEntry, name: string): number {
  const s = entry.stats?.find((x) => x.name === name);
  return typeof s?.value === "number" ? s.value : 0;
}

// One provider per ESPN league slug. A competition may span several slugs
// (the Champions League's qualifying rounds live under uefa.champions_qual);
// each provider stamps its rows with the owning competition + its own slug so
// the summary/events endpoints can be re-resolved per match later.
export class EspnSoccerProvider implements SoccerProvider {
  readonly competition: SoccerCompetition;
  readonly slug: string;
  private readonly national: boolean;
  private readonly siteBase: string;
  private readonly webBase: string;

  constructor(competition: SoccerCompetition, slug: string) {
    this.competition = competition;
    this.slug = slug;
    this.national = COMPETITIONS[competition].kind === "national";
    this.siteBase = `${SITE_ROOT}/${slug}`;
    this.webBase = `${WEB_ROOT}/${slug}`;
  }

  private matchFrom(ev: EspnEvent): Match | null {
    const comp = ev.competitions?.[0];
    if (!comp) return null;
    const home = comp.competitors?.find((c) => c.homeAway === "home");
    const away = comp.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) return null;

    const status = ev.status ?? comp.status;
    const state = (status?.type?.state as Match["state"]) ?? "pre";
    // ESPN puts the round in the season slug; the competition note carries the
    // human label ("Group A" for the World Cup, "1st Leg" for two-legged ties).
    const note = comp.notes?.[0]?.headline ?? null;
    // Scoreboard events carry `date` at the top level; the summary endpoint's
    // header only has it on the competition.
    const when = ev.date ?? comp.date;
    if (!when) return null;

    return {
      id: Number(ev.id),
      competition: this.competition,
      league_slug: this.slug,
      date: isoDateInProjectTz(when),
      datetime: when,
      season: ev.season?.year ?? 0,
      status: status?.type?.description ?? "",
      state,
      period: status?.period ?? 0,
      clock: status?.displayClock ?? null,
      stage: ev.season?.slug ?? null,
      group: note,
      venue: comp.venue?.fullName ?? null,
      home_team: teamFrom(home.team, this.national),
      away_team: teamFrom(away.team, this.national),
      home_score: Number(home.score) || 0,
      away_score: Number(away.score) || 0,
      finished: status?.type?.completed ?? false,
      winner_team_id: home.winner
        ? Number(home.team.id)
        : away.winner
          ? Number(away.team.id)
          : null,
    };
  }

  async listTeams(): Promise<SoccerTeam[]> {
    const data = await fetchJson<{
      sports?: Array<{ leagues?: Array<{ teams?: Array<{ team: EspnTeam }> }> }>;
    }>(this.siteBase, "/teams", { limit: "100" }, { revalidate: 60 * 60 * 24 });
    return (data.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) =>
      teamFrom(t.team, this.national),
    );
  }

  async listMatches({ dates }: { dates: string[] }): Promise<Match[]> {
    const out: Match[] = [];
    for (const date of dates) {
      const data = await fetchJson<{ events?: EspnEvent[] }>(
        this.siteBase,
        "/scoreboard",
        { dates: ymd(date) },
        { revalidate: 30 },
      );
      for (const ev of data.events ?? []) {
        const m = this.matchFrom(ev);
        if (m) out.push(m);
      }
    }
    return out;
  }

  // ESPN's `dates=YYYYMMDD-YYYYMMDD` range form started answering 400
  // ("Failed to get events endpoint.") on both hosts on 2026-09-16 for any
  // range, while the single-date form (`dates=YYYYMMDD`) kept working. So
  // this walks the range day by day with the single-date form instead,
  // de-duping events that show up on more than one day's response (has
  // happened with postponed/rescheduled fixtures). Same signature, same
  // return shape -- syncCompetition (live.ts) doesn't need to change.
  async listMatchesInRange(from: string, to: string): Promise<Match[]> {
    const seen = new Map<number, Match>();
    for (let day = from; day <= to; day = isoDateOffset(day, 1)) {
      const data = await fetchJson<{ events?: EspnEvent[] }>(
        this.siteBase,
        "/scoreboard",
        { dates: ymd(day) },
        { revalidate: 60 },
      );
      for (const ev of data.events ?? []) {
        const m = this.matchFrom(ev);
        if (m) seen.set(m.id, m);
      }
    }
    return Array.from(seen.values());
  }

  async getMatch(id: number): Promise<Match | null> {
    try {
      const data = await fetchJson<{ header?: EspnEvent }>(
        this.siteBase,
        "/summary",
        { event: String(id) },
        { revalidate: 30 },
      );
      return data.header ? this.matchFrom(data.header) : null;
    } catch {
      return null;
    }
  }

  async getMatchEvents(id: number): Promise<MatchEvent[]> {
    type KeyEvent = {
      type?: { text?: string; type?: string };
      clock?: { displayValue?: string };
      team?: { id?: string };
      scoringPlay?: boolean;
      participants?: Array<{ athlete?: { displayName?: string } }>;
    };
    let data: {
      header?: {
        competitions?: Array<{
          competitors?: Array<{ homeAway?: string; team?: { id?: string } }>;
        }>;
      };
      keyEvents?: KeyEvent[];
    };
    try {
      data = await fetchJson(this.siteBase, "/summary", { event: String(id) }, { revalidate: 30 });
    } catch {
      return [];
    }

    const sideById = new Map<string, "home" | "away">();
    for (const c of data.header?.competitions?.[0]?.competitors ?? []) {
      if (c.team?.id && (c.homeAway === "home" || c.homeAway === "away")) {
        sideById.set(String(c.team.id), c.homeAway);
      }
    }

    const out: MatchEvent[] = [];
    for (const e of data.keyEvents ?? []) {
      const label = e.type?.text ?? "";
      let kind: MatchEvent["kind"];
      if (e.type?.type === "goal" || e.scoringPlay) kind = "goal";
      else if (label === "Yellow Card") kind = "yellow";
      else if (label.includes("Red Card")) kind = "red";
      else continue; // skip substitutions and other non-key events

      const players = (e.participants ?? [])
        .map((p) => p.athlete?.displayName)
        .filter((n): n is string => Boolean(n));

      out.push({
        minute: e.clock?.displayValue ?? "",
        kind,
        side: e.team?.id ? sideById.get(String(e.team.id)) ?? null : null,
        player: players[0] ?? "",
        detail: players[1] ?? null,
      });
    }
    return out;
  }

  async getMatchDetail(id: number): Promise<MatchDetail | null> {
    type Summary = {
      header?: EspnEvent;
      gameInfo?: {
        venue?: { fullName?: string };
        attendance?: number;
        officials?: Array<{ fullName?: string; displayName?: string }>;
      };
      lastFiveGames?: Array<{ team?: EspnTeam; events?: EspnLastFiveEvent[] }>;
      boxscore?: {
        teams?: Array<{
          team?: EspnTeam;
          homeAway?: string;
          statistics?: Array<{ name?: string; displayValue?: string }>;
        }>;
      };
      rosters?: Array<{
        homeAway?: string;
        formation?: string;
        roster?: Array<{
          starter?: boolean;
          jersey?: string;
          position?: { abbreviation?: string; name?: string };
          athlete?: { displayName?: string };
        }>;
      }>;
      commentary?: Array<{ time?: { displayValue?: string }; text?: string }>;
      leaders?: Array<{
        team?: EspnTeam;
        leaders?: Array<{
          name?: string;
          displayName?: string;
          leaders?: Array<{
            displayValue?: string;
            shortDisplayValue?: string;
            athlete?: {
              displayName?: string;
              shortName?: string;
              position?: { abbreviation?: string };
            };
          }>;
        }>;
      }>;
    };
    let data: Summary;
    try {
      data = await fetchJson<Summary>(
        this.siteBase,
        "/summary",
        { event: String(id) },
        { revalidate: 30 },
      );
    } catch {
      return null;
    }
    const match = data.header ? this.matchFrom(data.header) : null;
    if (!match) return null;

    const lastFor = (teamId: number): RecentResult[] => {
      const block = (data.lastFiveGames ?? []).find(
        (b) => Number(b.team?.id) === teamId,
      );
      return (block?.events ?? [])
        .map((e) => recentFrom(e, teamId))
        .filter((r): r is RecentResult => r !== null)
        .sort((a, b) => b.date.localeCompare(a.date));
    };

    const statsFor = (side: "home" | "away"): TeamStatLine[] => {
      const team = (data.boxscore?.teams ?? []).find((t) => t.homeAway === side);
      const raw = new Map(
        (team?.statistics ?? []).map((s) => [s.name ?? "", s.displayValue ?? ""]),
      );
      const out: TeamStatLine[] = [];
      for (const [key, label] of STAT_LABELS) {
        const v = raw.get(key);
        if (v === undefined || v === "") continue;
        // passPct arrives as a 0..1 fraction on some feeds.
        const value =
          key === "passPct" && Number(v) <= 1 ? `${Math.round(Number(v) * 100)}%` : v;
        out.push({ key, label, value });
      }
      return out;
    };

    const lineups: Lineup[] = (data.rosters ?? [])
      .filter((r) => r.homeAway === "home" || r.homeAway === "away")
      .map((r) => ({
        side: r.homeAway as "home" | "away",
        formation: r.formation ?? null,
        players: (r.roster ?? []).map((p) => ({
          name: p.athlete?.displayName ?? "",
          position: p.position?.abbreviation ?? "",
          jersey: p.jersey ?? null,
          starter: Boolean(p.starter),
        })),
      }));

    const commentary: CommentaryLine[] = (data.commentary ?? [])
      .map((c) => ({ minute: c.time?.displayValue ?? "", text: c.text ?? "" }))
      .filter((c) => c.text)
      .reverse();

    // ESPN phrases a goal leader as "Matches: 3, Goals: 2"; keep only the
    // part that is the achievement, so a row reads "2 goals" not a sentence.
    const tidy = (raw: string): string => {
      const m = raw.match(/(Goals|Assists):\s*(\d+)/i);
      if (!m) return raw;
      const n = Number(m[2]);
      const word = m[1].toLowerCase();
      return `${n} ${n === 1 ? word.replace(/s$/, "") : word}`;
    };
    const leaders: TeamLeaders[] = (data.leaders ?? [])
      .map((block) => ({
        teamId: Number(block.team?.id),
        categories: (block.leaders ?? [])
          .map((c) => ({
            key: c.name ?? "",
            label: c.displayName ?? c.name ?? "",
            entries: (c.leaders ?? [])
              .map((l) => ({
                player: l.athlete?.displayName ?? l.athlete?.shortName ?? "",
                position: l.athlete?.position?.abbreviation ?? null,
                value: tidy(l.displayValue ?? ""),
              }))
              .filter((e) => e.player && e.value),
          }))
          .filter((c) => c.entries.length > 0),
      }))
      .filter((b) => Number.isFinite(b.teamId) && b.categories.length > 0);

    return {
      match,
      leaders,
      venue: data.gameInfo?.venue?.fullName ?? match.venue,
      attendance: data.gameInfo?.attendance ?? null,
      officials: (data.gameInfo?.officials ?? [])
        .map((o) => o.fullName ?? o.displayName ?? "")
        .filter(Boolean),
      last_five: { home: lastFor(match.home_team.id), away: lastFor(match.away_team.id) },
      stats: { home: statsFor("home"), away: statsFor("away") },
      lineups,
      commentary,
    };
  }

  async getTeamProfile(teamId: number): Promise<TeamProfile | null> {
    type TeamResp = {
      team?: EspnTeam & {
        venue?: { fullName?: string };
        record?: { items?: Array<{ summary?: string }> };
        standingSummary?: string;
        nextEvent?: Array<{ id?: string; name?: string; date?: string }>;
      };
    };
    let data: TeamResp;
    try {
      data = await fetchJson<TeamResp>(
        this.siteBase,
        `/teams/${teamId}`,
        {},
        { revalidate: 60 * 10 },
      );
    } catch {
      return null;
    }
    if (!data.team) return null;
    const next = data.team.nextEvent?.[0];
    return {
      team: teamFrom(data.team, this.national),
      venue: data.team.venue?.fullName ?? null,
      record_summary: data.team.record?.items?.[0]?.summary ?? null,
      standing_summary: data.team.standingSummary ?? null,
      next_event:
        next?.id && next.date
          ? { id: Number(next.id), name: next.name ?? "", date: next.date }
          : null,
    };
  }

  async getTeamSchedule(teamId: number): Promise<RecentResult[]> {
    // The "all" pseudo-league returns the club's fixtures across every
    // competition ESPN covers (domestic league, cups, Europe, friendlies).
    type Sched = {
      events?: Array<{
        id: string;
        date: string;
        name?: string;
        league?: { name?: string };
        season?: { slug?: string };
        competitions?: Array<{
          competitors?: Array<{
            homeAway: "home" | "away";
            score?: { value?: number; displayValue?: string } | string;
            winner?: boolean;
            team: EspnTeam;
          }>;
          status?: { type?: { completed?: boolean } };
        }>;
      }>;
    };
    let data: Sched;
    try {
      data = await fetchJson<Sched>(
        `${SITE_ROOT}/all`,
        `/teams/${teamId}/schedule`,
        {},
        { revalidate: 60 * 10 },
      );
    } catch {
      return [];
    }
    const out: RecentResult[] = [];
    for (const ev of data.events ?? []) {
      const comp = ev.competitions?.[0];
      const me = comp?.competitors?.find((c) => Number(c.team.id) === teamId);
      const opp = comp?.competitors?.find((c) => Number(c.team.id) !== teamId);
      if (!me || !opp) continue;
      const score = (c: typeof me): number => {
        const s = c.score;
        if (typeof s === "string") return Number(s) || 0;
        return Number(s?.value ?? s?.displayValue) || 0;
      };
      const gf = score(me);
      const ga = score(opp);
      const finished = comp?.status?.type?.completed ?? false;
      out.push({
        event_id: Number(ev.id),
        date: ev.date,
        competition_name: ev.league?.name ?? ev.season?.slug ?? "",
        opponent: {
          id: Number(opp.team.id),
          name: opp.team.displayName ?? opp.team.name ?? "",
          abbreviation: opp.team.abbreviation ?? "",
          crest: opp.team.logo ?? opp.team.logos?.[0]?.href ?? null,
        },
        home_away: me.homeAway === "home" ? "H" : "A",
        goals_for: gf,
        goals_against: ga,
        result: !finished ? "D" : gf > ga ? "W" : gf < ga ? "L" : "D",
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getTeamSquad(teamId: number): Promise<SquadPlayer[]> {
    type Roster = {
      athletes?: Array<{
        id?: string;
        displayName?: string;
        position?: { abbreviation?: string; name?: string };
        jersey?: string;
        age?: number;
        citizenship?: string;
        headshot?: { href?: string };
      }>;
    };
    let data: Roster;
    try {
      data = await fetchJson<Roster>(
        this.siteBase,
        `/teams/${teamId}/roster`,
        {},
        { revalidate: 60 * 60 * 6 },
      );
    } catch {
      return [];
    }
    return (data.athletes ?? []).map((a) => ({
      id: Number(a.id),
      name: a.displayName ?? "",
      position: a.position?.abbreviation ?? a.position?.name ?? "",
      jersey: a.jersey ?? null,
      age: typeof a.age === "number" ? a.age : null,
      nationality: a.citizenship ?? null,
      headshot: a.headshot?.href ?? null,
    }));
  }

  async listStandings(season?: number): Promise<SoccerStanding[]> {
    const data = await fetchJson<EspnStandings>(
      this.webBase,
      "/standings",
      season ? { season: String(season) } : {},
      { revalidate: 60 * 10 },
    );
    const out: SoccerStanding[] = [];
    for (const group of data.children ?? []) {
      for (const entry of group.standings?.entries ?? []) {
        out.push({
          team: teamFrom(entry.team, this.national),
          group: group.name ?? null,
          rank: statValue(entry, "rank"),
          played: statValue(entry, "gamesPlayed"),
          won: statValue(entry, "wins"),
          draw: statValue(entry, "ties"),
          lost: statValue(entry, "losses"),
          goals_for: statValue(entry, "pointsFor"),
          goals_against: statValue(entry, "pointsAgainst"),
          goal_diff: statValue(entry, "pointDifferential"),
          points: statValue(entry, "points"),
        });
      }
    }
    return out;
  }
}

/**
 * A cheap call to the primary host, used to find out whether an outage is
 * over. Health is recorded by `fetchJson` either way, so a success here is
 * what puts the site back on the primary and takes the banner down.
 */
export async function probePrimarySource(): Promise<boolean> {
  try {
    await fetchJson(
      SITE_HOSTS[0],
      "/uefa.champions/scoreboard",
      { limit: "1" },
      { revalidate: 0 },
    );
    return true;
  } catch {
    return false;
  }
}

const providers = new Map<string, SoccerProvider>();

// Provider for a competition's main phase (default) or for a specific ESPN
// slug within it (e.g. the qualifying feed).
export function soccerProvider(
  competition: SoccerCompetition = DEFAULT_COMPETITION,
  slug: string = COMPETITIONS[competition].espnSlugs[0],
): SoccerProvider {
  const key = `${competition}:${slug}`;
  let p = providers.get(key);
  if (!p) {
    p = new EspnSoccerProvider(competition, slug);
    providers.set(key, p);
  }
  return p;
}

// Every provider that feeds a competition (main phase first, then qualifying).
export function soccerProviders(competition: SoccerCompetition): SoccerProvider[] {
  return COMPETITIONS[competition].espnSlugs.map((slug) =>
    soccerProvider(competition, slug),
  );
}
