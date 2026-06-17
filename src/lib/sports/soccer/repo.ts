import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EngineQuote, TeamForm } from "@/lib/analysis/soccer/engine";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import type { Match, SoccerStanding, SoccerTeam } from "./provider";

export async function upsertTeams(teams: SoccerTeam[]): Promise<void> {
  if (teams.length === 0) return;
  const supabase = supabaseAdmin();
  const rows = teams.map((t) => ({
    id: t.id,
    name: t.name,
    abbreviation: t.abbreviation,
    country: t.country,
    crest_url: t.crest_url,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("soccer_teams").upsert(rows);
  if (error) throw new Error(`soccer_teams upsert: ${error.message}`);
}

export async function upsertMatches(matches: Match[]): Promise<void> {
  if (matches.length === 0) return;
  // Teams must exist first (FK). Collect both sides.
  const teams = new Map<number, SoccerTeam>();
  for (const m of matches) {
    teams.set(m.home_team.id, m.home_team);
    teams.set(m.away_team.id, m.away_team);
  }
  await upsertTeams([...teams.values()]);

  const supabase = supabaseAdmin();
  const rows = matches.map((m) => ({
    id: m.id,
    date: m.date,
    datetime: m.datetime,
    season: m.season,
    status: m.status,
    state: m.state,
    period: m.period,
    clock: m.clock,
    stage: m.stage,
    grp: m.group,
    home_team_id: m.home_team.id,
    away_team_id: m.away_team.id,
    home_score: m.home_score,
    away_score: m.away_score,
    finished: m.finished,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("soccer_matches").upsert(rows);
  if (error) throw new Error(`soccer_matches upsert: ${error.message}`);
}

export async function insertStandings(
  standings: SoccerStanding[],
): Promise<void> {
  if (standings.length === 0) return;
  await upsertTeams(standings.map((s) => s.team));

  const supabase = supabaseAdmin();
  const captured_at = new Date().toISOString();
  const rows = standings.map((s) => ({
    team_id: s.team.id,
    grp: s.group,
    rank: s.rank,
    played: s.played,
    won: s.won,
    draw: s.draw,
    lost: s.lost,
    goals_for: s.goals_for,
    goals_against: s.goals_against,
    goal_diff: s.goal_diff,
    points: s.points,
    captured_at,
  }));
  const { error } = await supabase.from("soccer_standings").insert(rows);
  if (error) throw new Error(`soccer_standings insert: ${error.message}`);
}

export type SoccerOddsRow = {
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  bookmaker: string;
  odds: number;
};

export async function insertSoccerOdds(
  rows: SoccerOddsRow[],
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };
  const supabase = supabaseAdmin();
  const captured_at = new Date().toISOString();
  const { error, count } = await supabase
    .from("soccer_odds_snapshots")
    .insert(
      rows.map((r) => ({ ...r, captured_at })),
      { count: "exact" },
    );
  if (error) throw new Error(`soccer_odds_snapshots insert: ${error.message}`);
  return { inserted: count ?? rows.length };
}

// Latest snapshot per (match, market, side, line, bookmaker) within 24h,
// returned as engine quotes grouped by match_id.
export async function loadLatestSoccerOdds(
  matchIds: number[],
): Promise<Map<number, EngineQuote[]>> {
  const out = new Map<number, EngineQuote[]>();
  if (matchIds.length === 0) return out;

  const supabase = supabaseAdmin();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("soccer_odds_snapshots")
    .select("match_id, market, side, line, bookmaker, odds, captured_at")
    .in("match_id", matchIds)
    .gte("captured_at", since)
    .order("captured_at", { ascending: false });
  if (error) throw new Error(`soccer_odds read: ${error.message}`);

  // First-seen per (market, side, line, bookmaker) wins — data is DESC by time.
  for (const matchId of matchIds) out.set(matchId, []);
  const seen = new Set<string>();
  for (const r of data ?? []) {
    const key = `${r.match_id}:${r.market}:${r.side}:${r.line}:${r.bookmaker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.get(r.match_id)?.push({
      market: r.market,
      side: r.side,
      line: r.line,
      bookmaker: r.bookmaker,
      odds: Number(r.odds),
    });
  }
  return out;
}

// Most recent standings snapshot per team → form.
export async function loadTeamForm(): Promise<Map<number, TeamForm>> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("soccer_standings")
    .select("team_id, points, goal_diff, played, captured_at")
    .order("captured_at", { ascending: false });
  if (error) throw new Error(`soccer_standings read: ${error.message}`);

  const out = new Map<number, TeamForm>();
  for (const r of data ?? []) {
    if (out.has(r.team_id)) continue;
    out.set(r.team_id, {
      points: r.points,
      goal_diff: r.goal_diff,
      played: r.played,
    });
  }
  return out;
}
