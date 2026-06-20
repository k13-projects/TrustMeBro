import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

// Read-side helpers for the /football pages. Public-read RLS lets the SSR
// client read these tables directly (no service role needed).

export type MatchRow = {
  id: number;
  date: string;
  datetime: string | null;
  state: "pre" | "in" | "post";
  status: string;
  clock: string | null;
  stage: string | null;
  group: string | null;
  home: { id: number; name: string; abbreviation: string; crest: string | null };
  away: { id: number; name: string; abbreviation: string; crest: string | null };
  home_score: number;
  away_score: number;
  finished: boolean;
};

type RawTeam = {
  id: number;
  name: string;
  abbreviation: string;
  crest_url: string | null;
};

type RawMatch = {
  id: number;
  date: string;
  datetime: string | null;
  state: string;
  status: string;
  clock: string | null;
  stage: string | null;
  grp: string | null;
  home_score: number;
  away_score: number;
  finished: boolean;
  home: RawTeam | RawTeam[] | null;
  away: RawTeam | RawTeam[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function toMatchRow(m: RawMatch): MatchRow {
  const home = one(m.home);
  const away = one(m.away);
  const teamLite = (t: RawTeam | null, fallback: string) => ({
    id: t?.id ?? 0,
    name: t?.name ?? fallback,
    abbreviation: t?.abbreviation ?? "",
    crest: t?.crest_url ?? null,
  });
  return {
    id: m.id,
    date: m.date,
    datetime: m.datetime,
    state: (m.state as MatchRow["state"]) ?? "pre",
    status: m.status,
    clock: m.clock,
    stage: m.stage,
    group: m.grp,
    home: teamLite(home, "Home"),
    away: teamLite(away, "Away"),
    home_score: m.home_score,
    away_score: m.away_score,
    finished: m.finished,
  };
}

const MATCH_SELECT =
  "id, date, datetime, state, status, clock, stage, grp, home_score, away_score, finished, " +
  "home:soccer_teams!soccer_matches_home_team_id_fkey(id, name, abbreviation, crest_url), " +
  "away:soccer_teams!soccer_matches_away_team_id_fkey(id, name, abbreviation, crest_url)";

export async function getMatchesByDates(dates: string[]): Promise<MatchRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select(MATCH_SELECT)
    .in("date", dates)
    .order("datetime", { ascending: true });
  return ((data ?? []) as unknown as RawMatch[]).map(toMatchRow);
}

export type StandingRow = {
  group: string | null;
  rank: number;
  team: { name: string; abbreviation: string; crest: string | null };
  played: number;
  won: number;
  draw: number;
  lost: number;
  goal_diff: number;
  points: number;
};

// Latest standings snapshot per team, grouped by group label.
export async function getStandings(): Promise<Map<string, StandingRow[]>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_standings")
    .select(
      "team_id, grp, rank, played, won, draw, lost, goal_diff, points, captured_at, " +
        "team:soccer_teams(name, abbreviation, crest_url)",
    )
    .order("captured_at", { ascending: false });

  const seen = new Set<number>();
  const byGroup = new Map<string, StandingRow[]>();
  for (const r of (data ?? []) as unknown as Array<{
    team_id: number;
    grp: string | null;
    rank: number;
    played: number;
    won: number;
    draw: number;
    lost: number;
    goal_diff: number;
    points: number;
    team: RawTeam | RawTeam[] | null;
  }>) {
    if (seen.has(r.team_id)) continue; // keep latest snapshot only
    seen.add(r.team_id);
    const team = one(r.team);
    const key = r.grp ?? "Table";
    const list = byGroup.get(key) ?? [];
    list.push({
      group: r.grp,
      rank: r.rank,
      team: {
        name: team?.name ?? "",
        abbreviation: team?.abbreviation ?? "",
        crest: team?.crest_url ?? null,
      },
      played: r.played,
      won: r.won,
      draw: r.draw,
      lost: r.lost,
      goal_diff: r.goal_diff,
      points: r.points,
    });
    byGroup.set(key, list);
  }
  for (const list of byGroup.values()) list.sort((a, b) => a.rank - b.rank);
  return byGroup;
}

export type PredictionDetail = {
  id: string;
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  confidence: number;
  best_odds: number;
  expected_value: number | null;
  is_banko: boolean;
  home: string;
  away: string;
  home_crest: string | null;
  away_crest: string | null;
  home_abbr: string;
  away_abbr: string;
  datetime: string | null;
};

type RawPrediction = {
  id: string;
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  confidence: number;
  best_odds: number;
  expected_value: number | null;
  is_banko: boolean;
  soccer_matches:
    | { datetime: string | null; home: RawTeam | RawTeam[] | null; away: RawTeam | RawTeam[] | null }
    | Array<{ datetime: string | null; home: RawTeam | RawTeam[] | null; away: RawTeam | RawTeam[] | null }>
    | null;
};

const PREDICTION_SELECT =
  "id, match_id, market, side, line, confidence, best_odds, expected_value, is_banko, " +
  "soccer_matches(datetime, " +
  "home:soccer_teams!soccer_matches_home_team_id_fkey(name, abbreviation, crest_url), " +
  "away:soccer_teams!soccer_matches_away_team_id_fkey(name, abbreviation, crest_url))";

function toPredictionDetail(p: RawPrediction): PredictionDetail {
  const match = one(p.soccer_matches);
  const home = one(match?.home ?? null);
  const away = one(match?.away ?? null);
  return {
    id: p.id,
    match_id: p.match_id,
    market: p.market,
    side: p.side,
    line: p.line,
    confidence: Number(p.confidence),
    best_odds: Number(p.best_odds),
    expected_value: p.expected_value === null ? null : Number(p.expected_value),
    is_banko: p.is_banko,
    home: home?.name ?? "Home",
    away: away?.name ?? "Away",
    home_crest: home?.crest_url ?? null,
    away_crest: away?.crest_url ?? null,
    home_abbr: home?.abbreviation ?? "",
    away_abbr: away?.abbreviation ?? "",
    datetime: match?.datetime ?? null,
  };
}

export async function getBankoPicks(): Promise<PredictionDetail[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_predictions")
    .select(PREDICTION_SELECT)
    .eq("is_banko", true)
    .eq("status", "pending")
    .order("confidence", { ascending: false });
  return ((data ?? []) as unknown as RawPrediction[]).map(toPredictionDetail);
}

export type CouponView = {
  id: string;
  kind: "banko" | "multiplier" | "surprise";
  target_multiplier: number | null;
  combined_odds: number;
  combined_probability: number | null;
  status: string;
  legs: PredictionDetail[];
};

export async function getEngineCoupons(): Promise<CouponView[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("engine_coupons")
    .select(
      "id, kind, target_multiplier, combined_odds, combined_probability, status, " +
        "engine_coupon_legs(leg_order, soccer_predictions(" +
        PREDICTION_SELECT +
        "))",
    )
    .eq("sport", "soccer")
    .eq("status", "pending")
    .order("target_multiplier", { ascending: true, nullsFirst: false });

  return (
    (data ?? []) as unknown as Array<{
      id: string;
      kind: CouponView["kind"];
      target_multiplier: number | null;
      combined_odds: number;
      combined_probability: number | null;
      status: string;
      engine_coupon_legs: Array<{
        leg_order: number;
        soccer_predictions: RawPrediction | RawPrediction[] | null;
      }>;
    }>
  ).map((c) => {
    const legs = (c.engine_coupon_legs ?? [])
      .sort((a, b) => a.leg_order - b.leg_order)
      .map((l) => one(l.soccer_predictions))
      .filter((p): p is RawPrediction => Boolean(p))
      .map(toPredictionDetail);
    return {
      id: c.id,
      kind: c.kind,
      target_multiplier: c.target_multiplier,
      combined_odds: Number(c.combined_odds),
      combined_probability:
        c.combined_probability === null ? null : Number(c.combined_probability),
      status: c.status,
      legs,
    };
  });
}

export type SoccerScore = {
  score: number;
  wins: number;
  losses: number;
  voids: number;
};

export async function getSoccerScore(): Promise<SoccerScore> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_system_score")
    .select("score, wins, losses, voids")
    .eq("id", true)
    .maybeSingle();
  return {
    score: Number(data?.score ?? 0),
    wins: Number(data?.wins ?? 0),
    losses: Number(data?.losses ?? 0),
    voids: Number(data?.voids ?? 0),
  };
}

export type SoccerScorePoint = {
  scoreAfter: number;
  delta: number;
  outcome: "won" | "lost" | "void";
  recordedAt: string;
};

// Running net-units history for the football ledger — the time series the
// scoreboard chart plots (same shape as the NBA `system_score_history`).
export async function getSoccerScoreHistory(): Promise<SoccerScorePoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_system_score_history")
    .select("delta, outcome, score_after, recorded_at")
    .order("recorded_at", { ascending: true })
    .limit(500);
  return (data ?? []).map((r) => ({
    scoreAfter: Number(r.score_after),
    delta: Number(r.delta),
    outcome: r.outcome as "won" | "lost" | "void",
    recordedAt: r.recorded_at as string,
  }));
}
