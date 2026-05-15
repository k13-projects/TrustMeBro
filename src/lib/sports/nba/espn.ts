import "server-only";

import type {
  Game,
  ListGamesParams,
  ListStatsParams,
  Paginated,
  Player,
  SearchPlayersParams,
  Stat,
  Team,
} from "../types";
import type { NbaProvider } from "./provider";
import { isoDateInProjectTz } from "@/lib/date";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

// ESPN team IDs are 1..30 and stable. Conference / division aren't on the
// summary boxscore payload, so we keep a static map (alignment hasn't moved
// since 2004 — Pistons stayed in Central, etc.). Update if NBA realigns.
const TEAM_ALIGNMENT: Record<
  string,
  { conference: string; division: string }
> = {
  ATL: { conference: "East", division: "Southeast" },
  BOS: { conference: "East", division: "Atlantic" },
  BKN: { conference: "East", division: "Atlantic" },
  CHA: { conference: "East", division: "Southeast" },
  CHI: { conference: "East", division: "Central" },
  CLE: { conference: "East", division: "Central" },
  DAL: { conference: "West", division: "Southwest" },
  DEN: { conference: "West", division: "Northwest" },
  DET: { conference: "East", division: "Central" },
  GS: { conference: "West", division: "Pacific" },
  GSW: { conference: "West", division: "Pacific" },
  HOU: { conference: "West", division: "Southwest" },
  IND: { conference: "East", division: "Central" },
  LAC: { conference: "West", division: "Pacific" },
  LAL: { conference: "West", division: "Pacific" },
  MEM: { conference: "West", division: "Southwest" },
  MIA: { conference: "East", division: "Southeast" },
  MIL: { conference: "East", division: "Central" },
  MIN: { conference: "West", division: "Northwest" },
  NO: { conference: "West", division: "Southwest" },
  NOP: { conference: "West", division: "Southwest" },
  NY: { conference: "East", division: "Atlantic" },
  NYK: { conference: "East", division: "Atlantic" },
  OKC: { conference: "West", division: "Northwest" },
  ORL: { conference: "East", division: "Southeast" },
  PHI: { conference: "East", division: "Atlantic" },
  PHX: { conference: "West", division: "Pacific" },
  POR: { conference: "West", division: "Northwest" },
  SAC: { conference: "West", division: "Pacific" },
  SA: { conference: "West", division: "Southwest" },
  SAS: { conference: "West", division: "Southwest" },
  TOR: { conference: "East", division: "Atlantic" },
  UTA: { conference: "West", division: "Northwest" },
  UTAH: { conference: "West", division: "Northwest" },
  WSH: { conference: "East", division: "Southeast" },
  WAS: { conference: "East", division: "Southeast" },
};

type FetchOpts = { revalidate?: number; signal?: AbortSignal };

async function fetchJson<T>(
  path: string,
  query: Record<string, string | undefined> = {},
  opts: FetchOpts = {},
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "TrustMeBro/0.1 (+contact: app)" },
    next: { revalidate: opts.revalidate ?? 60 },
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ESPN ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 200)}`,
    );
  }
  return res.json() as Promise<T>;
}

function ymd(iso: string): string {
  return iso.replace(/-/g, "").slice(0, 8);
}

type EspnTeamRef = {
  id: string;
  abbreviation: string;
  location?: string;
  name?: string;
  displayName?: string;
  shortDisplayName?: string;
};

function teamFromRef(t: EspnTeamRef): Team {
  const align =
    TEAM_ALIGNMENT[t.abbreviation?.toUpperCase()] ??
    { conference: "", division: "" };
  return {
    id: Number(t.id),
    abbreviation: t.abbreviation ?? "",
    city: t.location ?? "",
    conference: align.conference,
    division: align.division,
    full_name: t.displayName ?? `${t.location ?? ""} ${t.name ?? ""}`.trim(),
    name: t.name ?? t.shortDisplayName ?? "",
  };
}

type EspnEvent = {
  id: string;
  date: string;
  status: { type: { description: string; completed: boolean; state: string }; period?: number; displayClock?: string };
  season: { year: number; type: number; slug?: string };
  competitions: Array<{
    competitors: Array<{
      id: string;
      homeAway: "home" | "away";
      score: string;
      team: EspnTeamRef;
    }>;
    status?: { period?: number; displayClock?: string };
  }>;
};

function gameFromEvent(ev: EspnEvent): Game | null {
  const comp = ev.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const date = isoDateInProjectTz(ev.date);
  const slug = ev.season?.slug ?? "";

  return {
    id: Number(ev.id),
    date,
    datetime: ev.date,
    season: ev.season?.year ?? 0,
    status: ev.status?.type?.description ?? "",
    period: ev.status?.period ?? comp.status?.period ?? 0,
    time: ev.status?.displayClock ?? comp.status?.displayClock ?? null,
    postseason: slug.toLowerCase().includes("post"),
    home_team: teamFromRef(home.team),
    home_team_score: Number(home.score) || 0,
    visitor_team: teamFromRef(away.team),
    visitor_team_score: Number(away.score) || 0,
  };
}

type EspnAthlete = {
  active?: boolean;
  starter?: boolean;
  didNotPlay?: boolean;
  athlete: {
    id: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    shortName?: string;
    position?: { abbreviation?: string };
    jersey?: string;
  };
  stats: string[];
};

type EspnBoxscoreTeam = {
  team: EspnTeamRef & { displayName?: string };
  statistics: Array<{
    names: string[];
    keys: string[];
    athletes: EspnAthlete[];
  }>;
};

type EspnSummary = {
  header?: { id: string; competitions?: EspnEvent["competitions"]; season?: EspnEvent["season"]; date?: string };
  boxscore: {
    teams: Array<{ team: EspnTeamRef }>;
    players: EspnBoxscoreTeam[];
  };
};

function int(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/^\+/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function splitMA(s: string | undefined): [number | null, number | null, number | null] {
  if (!s) return [null, null, null];
  const parts = s.split("-");
  if (parts.length !== 2) return [null, null, null];
  const made = int(parts[0]);
  const att = int(parts[1]);
  if (made === null || att === null) return [made, att, null];
  if (att === 0) return [made, att, 0];
  return [made, att, Math.round((made / att) * 1000) / 1000];
}

function statFromAthlete(
  ath: EspnAthlete,
  keys: string[],
  game: Game,
  teamRef: EspnTeamRef,
): Stat | null {
  if (ath.didNotPlay) return null;
  const stats = ath.stats;
  if (!stats || stats.length === 0) return null;

  const idx = (k: string) => keys.indexOf(k);
  const minutes = stats[idx("minutes")] ?? "0";
  if (!minutes || minutes === "0") return null;

  const [fgm, fga, fgPct] = splitMA(stats[idx("fieldGoalsMade-fieldGoalsAttempted")]);
  const [fg3m, fg3a, fg3Pct] = splitMA(stats[idx("threePointFieldGoalsMade-threePointFieldGoalsAttempted")]);
  const [ftm, fta, ftPct] = splitMA(stats[idx("freeThrowsMade-freeThrowsAttempted")]);

  const team = teamFromRef(teamRef);
  const player: Player = {
    id: Number(ath.athlete.id),
    first_name: ath.athlete.firstName ?? (ath.athlete.displayName ?? "").split(" ")[0] ?? "",
    last_name:
      ath.athlete.lastName ??
      (ath.athlete.displayName ?? "").split(" ").slice(1).join(" "),
    position: ath.athlete.position?.abbreviation ?? "",
    height: null,
    weight: null,
    jersey_number: ath.athlete.jersey ?? null,
    college: null,
    country: null,
    draft_year: null,
    draft_round: null,
    draft_number: null,
    team,
  };

  return {
    id: 0,
    ast: int(stats[idx("assists")]) ?? 0,
    blk: int(stats[idx("blocks")]) ?? 0,
    dreb: int(stats[idx("defensiveRebounds")]) ?? 0,
    fg3_pct: fg3Pct ?? 0,
    fg3a: fg3a ?? 0,
    fg3m: fg3m ?? 0,
    fg_pct: fgPct ?? 0,
    fga: fga ?? 0,
    fgm: fgm ?? 0,
    ft_pct: ftPct ?? 0,
    fta: fta ?? 0,
    ftm: ftm ?? 0,
    game,
    min: minutes,
    oreb: int(stats[idx("offensiveRebounds")]) ?? 0,
    pf: int(stats[idx("fouls")]) ?? 0,
    player,
    pts: int(stats[idx("points")]) ?? 0,
    reb: int(stats[idx("rebounds")]) ?? 0,
    stl: int(stats[idx("steals")]) ?? 0,
    team,
    turnover: int(stats[idx("turnovers")]) ?? 0,
  };
}

export class EspnProvider implements NbaProvider {
  async listTeams(): Promise<Team[]> {
    const data = await fetchJson<{
      sports: Array<{ leagues: Array<{ teams: Array<{ team: EspnTeamRef }> }> }>;
    }>("/teams", { limit: "50" }, { revalidate: 60 * 60 * 24 });
    return (data.sports?.[0]?.leagues?.[0]?.teams ?? []).map((t) =>
      teamFromRef(t.team),
    );
  }

  async getTeam(id: number): Promise<Team | null> {
    try {
      const data = await fetchJson<{ team: EspnTeamRef }>(
        `/teams/${id}`,
        {},
        { revalidate: 60 * 60 * 24 },
      );
      return teamFromRef(data.team);
    } catch {
      return null;
    }
  }

  async searchPlayers(params: SearchPlayersParams): Promise<Paginated<Player>> {
    // ESPN doesn't have a clean player search endpoint. For MVP we hydrate
    // players from boxscore stats — sync-stats covers this path. Return empty
    // here so the contract holds.
    void params;
    return { data: [], next_cursor: null, per_page: 0 };
  }

  async getPlayer(id: number): Promise<Player | null> {
    void id;
    return null;
  }

  async listGames(params: ListGamesParams): Promise<Paginated<Game>> {
    const dates = params.dates ?? [];
    if (dates.length === 0) {
      return { data: [], next_cursor: null, per_page: 0 };
    }
    const out: Game[] = [];
    for (const date of dates) {
      const data = await fetchJson<{ events: EspnEvent[] }>(
        "/scoreboard",
        { dates: ymd(date) },
        { revalidate: 30 },
      );
      for (const ev of data.events ?? []) {
        const g = gameFromEvent(ev);
        if (g) out.push(g);
      }
    }
    return { data: out, next_cursor: null, per_page: out.length };
  }

  async getGame(id: number): Promise<Game | null> {
    try {
      const data = await fetchJson<EspnSummary>(
        "/summary",
        { event: String(id) },
        { revalidate: 30 },
      );
      const ev: EspnEvent | null = data.header
        ? ({
            id: data.header.id,
            date: data.header.date ?? "",
            status: { type: { description: "", completed: false, state: "" } },
            season: data.header.season ?? { year: 0, type: 0 },
            competitions: data.header.competitions ?? [],
          } as EspnEvent)
        : null;
      return ev ? gameFromEvent(ev) : null;
    } catch {
      return null;
    }
  }

  async listStats(params: ListStatsParams): Promise<Paginated<Stat>> {
    const out: Stat[] = [];
    const gameIds: number[] = params.game_ids ? [...params.game_ids] : [];

    if (gameIds.length === 0 && params.dates && params.dates.length > 0) {
      for (const date of params.dates) {
        const data = await fetchJson<{ events: EspnEvent[] }>(
          "/scoreboard",
          { dates: ymd(date) },
          { revalidate: 30 },
        );
        for (const ev of data.events ?? []) {
          if (ev.status?.type?.completed) gameIds.push(Number(ev.id));
        }
      }
    }

    for (const gid of gameIds) {
      const summary = await fetchJson<EspnSummary>(
        "/summary",
        { event: String(gid) },
        { revalidate: 60 },
      );
      const game = (await this.getGame(gid)) ?? null;
      if (!game) continue;

      for (const block of summary.boxscore?.players ?? []) {
        const section = block.statistics?.[0];
        if (!section) continue;
        for (const ath of section.athletes ?? []) {
          const stat = statFromAthlete(ath, section.keys, game, block.team);
          if (stat) out.push(stat);
        }
      }
    }

    return { data: out, next_cursor: null, per_page: out.length };
  }
}

let _provider: NbaProvider | null = null;

export function espnProvider(): NbaProvider {
  if (!_provider) _provider = new EspnProvider();
  return _provider;
}
