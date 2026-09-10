import "server-only";

import { isoDateInProjectTz } from "@/lib/date";
import { countryCrestUrl } from "./branding";
import {
  COMPETITIONS,
  DEFAULT_COMPETITION,
  type SoccerCompetition,
} from "./competitions";
import type {
  Match,
  MatchEvent,
  SoccerProvider,
  SoccerStanding,
  SoccerTeam,
} from "./provider";

// Scoreboard / summary live on the site API; standings on the web API.
const SITE_ROOT = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const WEB_ROOT = "https://site.web.api.espn.com/apis/v2/sports/soccer";

type FetchOpts = { revalidate?: number };

async function fetchJson<T>(
  base: string,
  path: string,
  query: Record<string, string | undefined> = {},
  opts: FetchOpts = {},
): Promise<T> {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "TrustMeBro/0.1 (+contact: app)" },
    next: { revalidate: opts.revalidate ?? 60 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ESPN soccer ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 200)}`,
    );
  }
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
    competitors?: Array<{
      homeAway: "home" | "away";
      score?: string;
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

    return {
      id: Number(ev.id),
      competition: this.competition,
      league_slug: this.slug,
      date: isoDateInProjectTz(ev.date),
      datetime: ev.date,
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

  async listMatchesInRange(from: string, to: string): Promise<Match[]> {
    const data = await fetchJson<{ events?: EspnEvent[] }>(
      this.siteBase,
      "/scoreboard",
      { dates: `${ymd(from)}-${ymd(to)}`, limit: "500" },
      { revalidate: 60 },
    );
    const out: Match[] = [];
    for (const ev of data.events ?? []) {
      const m = this.matchFrom(ev);
      if (m) out.push(m);
    }
    return out;
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
