import "server-only";

import { isoDateInProjectTz } from "@/lib/date";
import { SOCCER_LEAGUE_SLUG } from "@/lib/sports/registry";
import { countryCrestUrl } from "./branding";
import type {
  Match,
  MatchEvent,
  SoccerProvider,
  SoccerStanding,
  SoccerTeam,
} from "./provider";

// Scoreboard / summary live on the site API; standings on the web API.
const SITE_BASE = `https://site.api.espn.com/apis/site/v2/sports/soccer/${SOCCER_LEAGUE_SLUG}`;
const WEB_BASE = `https://site.web.api.espn.com/apis/v2/sports/soccer/${SOCCER_LEAGUE_SLUG}`;

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
};

function teamFrom(t: EspnTeam): SoccerTeam {
  const abbreviation = t.abbreviation ?? "";
  return {
    id: Number(t.id),
    name: t.displayName ?? t.name ?? t.location ?? "",
    abbreviation,
    country: t.location ?? t.displayName ?? "",
    crest_url: t.logo ?? countryCrestUrl(abbreviation),
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
  }>;
};

function matchFrom(ev: EspnEvent): Match | null {
  const comp = ev.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const status = ev.status ?? comp.status;
  const state = (status?.type?.state as Match["state"]) ?? "pre";
  // ESPN puts the group/round in the season slug; the competition note often
  // carries the human label ("Group A", "Round of 16").
  const note = comp.notes?.[0]?.headline ?? null;

  return {
    id: Number(ev.id),
    date: isoDateInProjectTz(ev.date),
    datetime: ev.date,
    season: ev.season?.year ?? 0,
    status: status?.type?.description ?? "",
    state,
    period: status?.period ?? 0,
    clock: status?.displayClock ?? null,
    stage: ev.season?.slug ?? null,
    group: note,
    home_team: teamFrom(home.team),
    away_team: teamFrom(away.team),
    home_score: Number(home.score) || 0,
    away_score: Number(away.score) || 0,
    finished: status?.type?.completed ?? false,
  };
}

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

export class EspnSoccerProvider implements SoccerProvider {
  async listTeams(): Promise<SoccerTeam[]> {
    const data = await fetchJson<{
      sports?: Array<{ leagues?: Array<{ teams?: Array<{ team: EspnTeam }> }> }>;
    }>(SITE_BASE, "/teams", { limit: "100" }, { revalidate: 60 * 60 * 24 });
    return (data.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) =>
      teamFrom(t.team),
    );
  }

  async listMatches({ dates }: { dates: string[] }): Promise<Match[]> {
    const out: Match[] = [];
    for (const date of dates) {
      const data = await fetchJson<{ events?: EspnEvent[] }>(
        SITE_BASE,
        "/scoreboard",
        { dates: ymd(date) },
        { revalidate: 30 },
      );
      for (const ev of data.events ?? []) {
        const m = matchFrom(ev);
        if (m) out.push(m);
      }
    }
    return out;
  }

  async getMatch(id: number): Promise<Match | null> {
    try {
      const data = await fetchJson<{ header?: EspnEvent }>(
        SITE_BASE,
        "/summary",
        { event: String(id) },
        { revalidate: 30 },
      );
      return data.header ? matchFrom(data.header) : null;
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
      data = await fetchJson(SITE_BASE, "/summary", { event: String(id) }, { revalidate: 30 });
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
      else if (label === "Substitution") kind = "sub";
      else continue;

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
      WEB_BASE,
      "/standings",
      season ? { season: String(season) } : {},
      { revalidate: 60 * 10 },
    );
    const out: SoccerStanding[] = [];
    for (const group of data.children ?? []) {
      for (const entry of group.standings?.entries ?? []) {
        out.push({
          team: teamFrom(entry.team),
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

let _provider: SoccerProvider | null = null;

export function soccerProvider(): SoccerProvider {
  if (!_provider) _provider = new EspnSoccerProvider();
  return _provider;
}
