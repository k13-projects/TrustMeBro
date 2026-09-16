import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EngineQuote, TeamForm } from "@/lib/analysis/soccer/engine";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import type { SoccerCompetition } from "./competitions";
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
    color: t.color,
    alt_color: t.alt_color,
    // Accent-folded haystack for the search palette (migration 0027).
    name_search: `${t.name} ${t.abbreviation} ${t.country}`
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/ø/g, "o")
      .replace(/ł/g, "l"),
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
    competition: m.competition,
    league_slug: m.league_slug,
    date: m.date,
    datetime: m.datetime,
    season: m.season,
    status: m.status,
    state: m.state,
    period: m.period,
    clock: m.clock,
    stage: m.stage,
    grp: m.group,
    venue: m.venue,
    home_team_id: m.home_team.id,
    away_team_id: m.away_team.id,
    home_score: m.home_score,
    away_score: m.away_score,
    finished: m.finished,
    winner_team_id: m.winner_team_id,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("soccer_matches").upsert(rows);
  if (error) throw new Error(`soccer_matches upsert: ${error.message}`);
}

export async function insertStandings(
  competition: SoccerCompetition,
  standings: SoccerStanding[],
): Promise<void> {
  if (standings.length === 0) return;
  await upsertTeams(standings.map((s) => s.team));

  const supabase = supabaseAdmin();
  const captured_at = new Date().toISOString();
  const rows = standings.map((s) => ({
    competition,
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

export type OddsHistoryRow = {
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  prob: number;
  best_odds: number | null;
  book_count: number;
};

// One compact consensus row per (match, market, side, line) per run — the
// odds-movement series. Never pruned (a few rows per match per day).
export async function insertOddsHistory(rows: OddsHistoryRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = supabaseAdmin();
  const captured_at = new Date().toISOString();
  const { error } = await supabase
    .from("soccer_odds_history")
    .insert(rows.map((r) => ({ ...r, captured_at })));
  if (error) throw new Error(`soccer_odds_history insert: ${error.message}`);
  return rows.length;
}

// Drop soccer odds snapshots older than the cutoff (48h default). The engine
// only reads the last 24h and picks persist their own odds, so this is pure
// cleanup — scoreboard/history are unaffected.
export async function pruneSoccerOdds(
  olderThanHours = 48,
): Promise<{ deleted: number }> {
  const supabase = supabaseAdmin();
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();
  const { error, count } = await supabase
    .from("soccer_odds_snapshots")
    .delete({ count: "exact" })
    .lt("captured_at", cutoff);
  if (error) throw new Error(`soccer_odds_snapshots prune: ${error.message}`);
  return { deleted: count ?? 0 };
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

// Which of these matches already have a stored `btts` snapshot — the
// per-event BTTS pull is billed per match (unlike the bulk h2h/totals pull,
// which is a flat cost per competition), so this is the credit-control gate:
// a match already in this set is never fetched again, full stop.
export async function loadMatchIdsWithBttsSnapshot(
  matchIds: number[],
): Promise<Set<number>> {
  if (matchIds.length === 0) return new Set();
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("soccer_odds_snapshots")
    .select("match_id")
    .eq("market", "btts")
    .in("match_id", matchIds);
  if (error) throw new Error(`soccer_odds_snapshots btts read: ${error.message}`);
  return new Set((data ?? []).map((r) => r.match_id as number));
}

// Odds-pull cadence bookkeeping (see odds-cadence.ts), reusing the
// competition-agnostic ingest_state table (migration 0021) rather than a new
// one — one row per competition, keyed "soccer_odds:<competition>".
export async function getLastOddsPullAt(
  competition: SoccerCompetition,
): Promise<Date | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("ingest_state")
    .select("last_run_at")
    .eq("key", `soccer_odds:${competition}`)
    .maybeSingle();
  if (error) throw new Error(`ingest_state read: ${error.message}`);
  return data?.last_run_at ? new Date(data.last_run_at) : null;
}

export async function recordOddsPull(competition: SoccerCompetition): Promise<void> {
  const supabase = supabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("ingest_state")
    .upsert(
      { key: `soccer_odds:${competition}`, last_run_at: now, updated_at: now },
      { onConflict: "key" },
    );
  if (error) throw new Error(`ingest_state write: ${error.message}`);
}

// Most recent standings snapshot per team within a competition → form.
export async function loadTeamForm(
  competition: SoccerCompetition,
): Promise<Map<number, TeamForm>> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("soccer_standings")
    .select("team_id, points, goal_diff, played, captured_at")
    .eq("competition", competition)
    .order("captured_at", { ascending: false })
    .limit(2000);
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
