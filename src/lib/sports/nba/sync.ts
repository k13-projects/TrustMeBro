import "server-only";

import { nbaProvider } from "./index";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Game, Player, Stat, Team } from "../types";

const STATS_PER_PAGE = 100;

/**
 * Parse balldontlie "min" field. Can be "MM:SS", "MM", or "" (DNP).
 * Returns minutes as a fractional number, or null if the player didn't play.
 */
export function parseMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const [m, s] = trimmed.split(":");
    const mi = Number(m);
    const sec = Number(s);
    if (!Number.isFinite(mi) || !Number.isFinite(sec)) return null;
    return Math.round((mi + sec / 60) * 100) / 100;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function teamRow(t: Team) {
  return {
    id: t.id,
    abbreviation: t.abbreviation,
    city: t.city,
    conference: t.conference,
    division: t.division,
    full_name: t.full_name,
    name: t.name,
  };
}

function playerRow(p: Player) {
  return {
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    position: p.position || null,
    height: p.height,
    weight: p.weight,
    jersey_number: p.jersey_number,
    college: p.college,
    country: p.country,
    draft_year: p.draft_year,
    draft_round: p.draft_round,
    draft_number: p.draft_number,
    team_id: p.team?.id ?? null,
  };
}

function gameRow(g: Game) {
  return {
    id: g.id,
    date: g.date,
    datetime: g.datetime,
    season: g.season,
    status: g.status,
    period: g.period,
    time: g.time,
    postseason: g.postseason,
    home_team_id: g.home_team.id,
    visitor_team_id: g.visitor_team.id,
    home_team_score: g.home_team_score,
    visitor_team_score: g.visitor_team_score,
  };
}

function statRow(s: Stat) {
  return {
    game_id: s.game.id,
    player_id: s.player.id,
    team_id: s.team.id,
    minutes: parseMinutes(s.min),
    points: s.pts,
    rebounds: s.reb,
    assists: s.ast,
    steals: s.stl,
    blocks: s.blk,
    turnovers: s.turnover,
    personal_fouls: s.pf,
    fgm: s.fgm,
    fga: s.fga,
    fg_pct: s.fg_pct,
    fg3m: s.fg3m,
    fg3a: s.fg3a,
    fg3_pct: s.fg3_pct,
    ftm: s.ftm,
    fta: s.fta,
    ft_pct: s.ft_pct,
    is_home: s.team.id === s.game.home_team.id,
    started: null,
  };
}

function dedupeById<T extends { id: number }>(rows: T[]): T[] {
  const map = new Map<number, T>();
  for (const r of rows) map.set(r.id, r);
  return [...map.values()];
}

export type SyncResult = {
  dates: string[];
  games_upserted: number;
  teams_upserted: number;
  players_upserted: number;
  stats_upserted: number;
};

export type SeedResult = {
  teams_upserted: number;
  players_upserted: number;
  pages_fetched: number;
};

/**
 * Seed the `teams` and `players` tables with the *entire* current league —
 * not just teams that have a game on the dates we happen to sync. Required
 * because `syncDates` only writes teams/players seen in box scores, so any
 * team without a game in the sync window (e.g. an off-day) was missing from
 * the DB and produced 404s on `/teams/[id]`.
 *
 * Idempotent: safe to call repeatedly. Upserts by id.
 */
export async function seedTeamsAndAllPlayers(): Promise<SeedResult> {
  const provider = nbaProvider();
  const supabase = supabaseAdmin();

  const teams = await provider.listTeams();
  if (teams.length > 0) {
    const { error } = await supabase
      .from("teams")
      .upsert(teams.map(teamRow), { onConflict: "id" });
    if (error) throw new Error(`seed teams upsert failed: ${error.message}`);
  }

  // ESPN's `/players` search endpoint isn't usable for a "list everyone"
  // request (the provider's searchPlayers returns []). Hit the per-team
  // roster endpoint instead — 30 calls, ~18 players each = ~540 players,
  // covers the active league.
  const allPlayers: Array<{ player: Player; team: Team }> = [];
  let pages = 0;
  for (const team of teams) {
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.id}/roster`,
        {
          headers: { "User-Agent": "TrustMeBro/0.1 (+contact: app)" },
          // Roster moves once a day at most; cache aggressively.
          next: { revalidate: 3600 },
        },
      );
      pages += 1;
      if (!res.ok) continue;
      const data = (await res.json()) as { athletes?: EspnRosterAthlete[] };
      for (const a of data.athletes ?? []) {
        const id = Number(a.id);
        if (!Number.isFinite(id)) continue;
        allPlayers.push({
          player: {
            id,
            first_name: a.firstName ?? "",
            last_name: a.lastName ?? "",
            position: a.position?.abbreviation ?? "",
            height: a.displayHeight ?? null,
            weight: a.displayWeight ?? null,
            jersey_number: a.jersey ?? null,
            college: a.college?.name ?? null,
            country: a.birthPlace?.country ?? null,
            draft_year: null,
            draft_round: null,
            draft_number: null,
            team,
          },
          team,
        });
      }
    } catch {
      // Skip a team if ESPN momentarily 5xx's. Subsequent calls will fill.
    }
  }

  const uniquePlayers = dedupeById(allPlayers.map((p) => p.player));
  if (uniquePlayers.length > 0) {
    const { error } = await supabase
      .from("players")
      .upsert(uniquePlayers.map(playerRow), { onConflict: "id" });
    if (error) throw new Error(`seed players upsert failed: ${error.message}`);
  }

  return {
    teams_upserted: teams.length,
    players_upserted: uniquePlayers.length,
    pages_fetched: pages,
  };
}

type EspnRosterAthlete = {
  id: string | number;
  firstName?: string;
  lastName?: string;
  position?: { abbreviation?: string };
  jersey?: string | null;
  displayHeight?: string | null;
  displayWeight?: string | null;
  college?: { name?: string };
  birthPlace?: { country?: string };
};

/**
 * Sync NBA games + per-player box scores for the given dates.
 *
 * Order of upserts: teams → players → games → player_game_stats
 * (each table's FKs require the previous one to exist).
 */
export async function syncDates(dates: string[]): Promise<SyncResult> {
  const provider = nbaProvider();
  const supabase = supabaseAdmin();

  let allStats: Stat[] = [];
  let allGames: Game[] = [];

  for (const date of dates) {
    let cursor: number | undefined = undefined;
    do {
      const page = await provider.listStats({
        dates: [date],
        per_page: STATS_PER_PAGE,
        cursor,
      });
      allStats = allStats.concat(page.data);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);

    const gamesPage = await provider.listGames({
      dates: [date],
      per_page: 100,
    });
    allGames = allGames.concat(gamesPage.data);
  }

  const teams = dedupeById([
    ...allGames.flatMap((g) => [g.home_team, g.visitor_team]),
    ...allStats.map((s) => s.team),
  ]);
  const players = dedupeById(allStats.map((s) => s.player));
  const games = dedupeById(allGames);

  if (teams.length > 0) {
    const { error } = await supabase
      .from("teams")
      .upsert(teams.map(teamRow), { onConflict: "id" });
    if (error) throw new Error(`teams upsert failed: ${error.message}`);
  }

  if (players.length > 0) {
    const { error } = await supabase
      .from("players")
      .upsert(players.map(playerRow), { onConflict: "id" });
    if (error) throw new Error(`players upsert failed: ${error.message}`);
  }

  if (games.length > 0) {
    const { error } = await supabase
      .from("games")
      .upsert(games.map(gameRow), { onConflict: "id" });
    if (error) throw new Error(`games upsert failed: ${error.message}`);
  }

  if (allStats.length > 0) {
    const { error } = await supabase
      .from("player_game_stats")
      .upsert(allStats.map(statRow), { onConflict: "game_id,player_id" });
    if (error) throw new Error(`stats upsert failed: ${error.message}`);
  }

  return {
    dates,
    games_upserted: games.length,
    teams_upserted: teams.length,
    players_upserted: players.length,
    stats_upserted: allStats.length,
  };
}
