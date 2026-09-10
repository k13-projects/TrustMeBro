import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import { QUALIFYING_STAGES, type SoccerCompetition } from "./competitions";

// Read-side helpers for the /football pages. Public-read RLS lets the SSR
// client read these tables directly (no service role needed). Every query is
// scoped to one competition so the World Cup archive and the live Champions
// League never bleed into each other.

export type MatchRow = {
  id: number;
  competition: SoccerCompetition;
  date: string;
  datetime: string | null;
  state: "pre" | "in" | "post";
  status: string;
  clock: string | null;
  stage: string | null;
  group: string | null;
  venue: string | null;
  home: TeamLite;
  away: TeamLite;
  home_score: number;
  away_score: number;
  finished: boolean;
};

export type TeamLite = {
  id: number;
  name: string;
  abbreviation: string;
  crest: string | null;
  color: string | null;
};

type RawTeam = {
  id: number;
  name: string;
  abbreviation: string;
  crest_url: string | null;
  color?: string | null;
};

type RawMatch = {
  id: number;
  competition: string;
  date: string;
  datetime: string | null;
  state: string;
  status: string;
  clock: string | null;
  stage: string | null;
  grp: string | null;
  venue: string | null;
  home_score: number;
  away_score: number;
  finished: boolean;
  home: RawTeam | RawTeam[] | null;
  away: RawTeam | RawTeam[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function teamLite(t: RawTeam | null, fallback: string): TeamLite {
  return {
    id: t?.id ?? 0,
    name: t?.name ?? fallback,
    abbreviation: t?.abbreviation ?? "",
    crest: t?.crest_url ?? null,
    color: t?.color ?? null,
  };
}

function toMatchRow(m: RawMatch): MatchRow {
  return {
    id: m.id,
    competition: m.competition as SoccerCompetition,
    date: m.date,
    datetime: m.datetime,
    state: (m.state as MatchRow["state"]) ?? "pre",
    status: m.status,
    clock: m.clock,
    stage: m.stage,
    group: m.grp,
    venue: m.venue,
    home: teamLite(one(m.home), "Home"),
    away: teamLite(one(m.away), "Away"),
    home_score: m.home_score,
    away_score: m.away_score,
    finished: m.finished,
  };
}

const TEAM_COLS = "id, name, abbreviation, crest_url, color";
const MATCH_SELECT =
  "id, competition, date, datetime, state, status, clock, stage, grp, venue, home_score, away_score, finished, " +
  `home:soccer_teams!soccer_matches_home_team_id_fkey(${TEAM_COLS}), ` +
  `away:soccer_teams!soccer_matches_away_team_id_fkey(${TEAM_COLS})`;

export async function getMatchesByDates(
  competition: SoccerCompetition,
  dates: string[],
): Promise<MatchRow[]> {
  if (dates.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select(MATCH_SELECT)
    .eq("competition", competition)
    .in("date", dates)
    .order("datetime", { ascending: true });
  return ((data ?? []) as unknown as RawMatch[]).map(toMatchRow);
}

export async function getMatchesBetween(
  competition: SoccerCompetition,
  from: string,
  to: string,
): Promise<MatchRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select(MATCH_SELECT)
    .eq("competition", competition)
    .gte("date", from)
    .lte("date", to)
    .order("datetime", { ascending: true })
    .limit(500);
  return ((data ?? []) as unknown as RawMatch[]).map(toMatchRow);
}

// ---------------------------------------------------------------------------
// Rounds — how a competition's fixtures group on the schedule page.
//
// League phase matchdays aren't in the ESPN payload, but every matchday is
// played inside one calendar week (Tue–Thu), so the ordinal of a match's ISO
// week among the phase's distinct weeks IS its matchday. Knockout/qualifying
// rounds group by their stage slug. The World Cup keeps grouping by day.
// ---------------------------------------------------------------------------
export type Round = {
  key: string; // "md3" | "playoff-round" | "round-of-16" | ...
  label: string; // "Matchday 3" | "Play-off Round"
  kind: "qualifying" | "league" | "knockout";
  from: string; // first LA-day
  to: string; // last LA-day
  played: number;
  total: number;
  matches: MatchRow[];
};

function isoWeekKey(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

const KNOCKOUT_LABEL: Record<string, string> = {
  "knockout-playoff": "Knockout Play-offs",
  "knockout-round-playoffs": "Knockout Play-offs",
  "round-of-32": "Round of 32",
  "round-of-16": "Round of 16",
  quarterfinals: "Quarter-finals",
  semifinals: "Semi-finals",
  "3rd-place-match": "Third Place",
  final: "Final",
};

const QUALIFYING_LABEL: Record<string, string> = {
  "first-round": "First Qualifying Round",
  "second-round": "Second Qualifying Round",
  "third-round": "Third Qualifying Round",
  "playoff-round": "Play-off Round",
};

export function groupIntoRounds(matches: MatchRow[]): Round[] {
  const byKey = new Map<string, Round>();
  const leagueWeeks = [
    ...new Set(
      matches.filter((m) => m.stage === "league-phase").map((m) => isoWeekKey(m.date)),
    ),
  ].sort();

  for (const m of matches) {
    let key: string;
    let label: string;
    let kind: Round["kind"];
    if (m.stage === "league-phase") {
      const md = leagueWeeks.indexOf(isoWeekKey(m.date)) + 1;
      key = `md${md}`;
      label = `Matchday ${md}`;
      kind = "league";
    } else if (m.stage && QUALIFYING_STAGES.has(m.stage)) {
      key = m.stage;
      label = QUALIFYING_LABEL[m.stage] ?? m.stage;
      kind = "qualifying";
    } else {
      key = m.stage ?? "other";
      label = KNOCKOUT_LABEL[key] ?? key.replace(/-/g, " ");
      kind = "knockout";
    }
    const r = byKey.get(key) ?? {
      key,
      label,
      kind,
      from: m.date,
      to: m.date,
      played: 0,
      total: 0,
      matches: [],
    };
    r.from = m.date < r.from ? m.date : r.from;
    r.to = m.date > r.to ? m.date : r.to;
    r.total += 1;
    if (m.finished) r.played += 1;
    r.matches.push(m);
    byKey.set(key, r);
  }
  return [...byKey.values()].sort((a, b) => a.from.localeCompare(b.from));
}

// Every round of the competition's season, in calendar order.
export async function getRounds(competition: SoccerCompetition): Promise<Round[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select(MATCH_SELECT)
    .eq("competition", competition)
    .order("datetime", { ascending: true })
    .limit(1000);
  return groupIntoRounds(((data ?? []) as unknown as RawMatch[]).map(toMatchRow));
}

// The round to show by default: the one in progress today, else the next one
// to kick off, else the last one played.
export function currentRound(rounds: Round[], today: string): Round | null {
  if (rounds.length === 0) return null;
  const live = rounds.find((r) => r.from <= today && r.to >= today);
  if (live) return live;
  const upcoming = rounds.find((r) => r.from > today);
  if (upcoming) return upcoming;
  return rounds[rounds.length - 1];
}

// Label for a match's round, for banners/cards ("Matchday 2", "Play-off Round · 2nd Leg").
export function roundLabelFor(match: MatchRow, rounds: Round[]): string | null {
  const r = rounds.find((x) => x.matches.some((m) => m.id === match.id));
  if (!r) return null;
  return match.group && r.kind !== "league" ? `${r.label} · ${match.group}` : r.label;
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------
export type StandingRow = {
  group: string | null;
  rank: number;
  team: { id: number; name: string; abbreviation: string; crest: string | null; color: string | null };
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
};

// Latest standings snapshot per team, grouped by group label.
export async function getStandings(
  competition: SoccerCompetition,
): Promise<Map<string, StandingRow[]>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_standings")
    .select(
      "team_id, grp, rank, played, won, draw, lost, goals_for, goals_against, goal_diff, points, captured_at, " +
        `team:soccer_teams(${TEAM_COLS})`,
    )
    .eq("competition", competition)
    .order("captured_at", { ascending: false })
    .limit(2000);

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
    goals_for: number;
    goals_against: number;
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
        id: r.team_id,
        name: team?.name ?? "",
        abbreviation: team?.abbreviation ?? "",
        crest: team?.crest_url ?? null,
        color: team?.color ?? null,
      },
      played: r.played,
      won: r.won,
      draw: r.draw,
      lost: r.lost,
      goals_for: r.goals_for,
      goals_against: r.goals_against,
      goal_diff: r.goal_diff,
      points: r.points,
    });
    byGroup.set(key, list);
  }
  for (const list of byGroup.values()) list.sort((a, b) => a.rank - b.rank);
  return byGroup;
}

// ---------------------------------------------------------------------------
// Predictions / coupons
// ---------------------------------------------------------------------------
export type PredictionDetail = {
  id: string;
  competition: SoccerCompetition;
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  confidence: number;
  best_odds: number;
  expected_value: number | null;
  is_banko: boolean;
  status: "pending" | "won" | "lost" | "void";
  home: string;
  away: string;
  home_crest: string | null;
  away_crest: string | null;
  home_abbr: string;
  away_abbr: string;
  home_color: string | null;
  away_color: string | null;
  datetime: string | null;
  stage: string | null;
};

type RawPrediction = {
  id: string;
  competition: string;
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  confidence: number;
  best_odds: number;
  expected_value: number | null;
  is_banko: boolean;
  status: PredictionDetail["status"];
  soccer_matches:
    | { datetime: string | null; stage: string | null; home: RawTeam | RawTeam[] | null; away: RawTeam | RawTeam[] | null }
    | Array<{ datetime: string | null; stage: string | null; home: RawTeam | RawTeam[] | null; away: RawTeam | RawTeam[] | null }>
    | null;
};

const PREDICTION_SELECT =
  "id, competition, match_id, market, side, line, confidence, best_odds, expected_value, is_banko, status, " +
  "soccer_matches(datetime, stage, " +
  `home:soccer_teams!soccer_matches_home_team_id_fkey(${TEAM_COLS}), ` +
  `away:soccer_teams!soccer_matches_away_team_id_fkey(${TEAM_COLS}))`;

function toPredictionDetail(p: RawPrediction): PredictionDetail {
  const match = one(p.soccer_matches);
  const home = one(match?.home ?? null);
  const away = one(match?.away ?? null);
  return {
    id: p.id,
    competition: p.competition as SoccerCompetition,
    match_id: p.match_id,
    market: p.market,
    side: p.side,
    line: p.line,
    confidence: Number(p.confidence),
    best_odds: Number(p.best_odds),
    expected_value: p.expected_value === null ? null : Number(p.expected_value),
    is_banko: p.is_banko,
    status: p.status,
    home: home?.name ?? "Home",
    away: away?.name ?? "Away",
    home_crest: home?.crest_url ?? null,
    away_crest: away?.crest_url ?? null,
    home_abbr: home?.abbreviation ?? "",
    away_abbr: away?.abbreviation ?? "",
    home_color: home?.color ?? null,
    away_color: away?.color ?? null,
    datetime: match?.datetime ?? null,
    stage: match?.stage ?? null,
  };
}

export async function getBankoPicks(
  competition: SoccerCompetition,
): Promise<PredictionDetail[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_predictions")
    .select(PREDICTION_SELECT)
    .eq("competition", competition)
    .eq("is_banko", true)
    .eq("status", "pending")
    .order("confidence", { ascending: false });
  return ((data ?? []) as unknown as RawPrediction[]).map(toPredictionDetail);
}

// Most recent graded picks — the archive's "how it went" strip and the live
// competition's recent-form panel.
export async function getRecentSettledPicks(
  competition: SoccerCompetition,
  limit = 12,
): Promise<PredictionDetail[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_predictions")
    .select(PREDICTION_SELECT)
    .eq("competition", competition)
    .in("status", ["won", "lost", "void"])
    .order("settled_at", { ascending: false })
    .limit(limit);
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

export async function getEngineCoupons(
  competition: SoccerCompetition,
): Promise<CouponView[]> {
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
    .eq("competition", competition)
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

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------
export type SoccerScore = {
  score: number;
  wins: number;
  losses: number;
  voids: number;
};

export async function getSoccerScore(
  competition: SoccerCompetition,
): Promise<SoccerScore> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_ledgers")
    .select("score, wins, losses, voids")
    .eq("competition", competition)
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

// Running net-units history for a competition's ledger — the time series the
// scoreboard chart plots (same shape as the NBA `system_score_history`).
export async function getSoccerScoreHistory(
  competition: SoccerCompetition,
): Promise<SoccerScorePoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_system_score_history")
    .select("delta, outcome, score_after, recorded_at")
    .eq("competition", competition)
    .order("recorded_at", { ascending: true })
    .limit(500);
  return (data ?? []).map((r) => ({
    scoreAfter: Number(r.score_after),
    delta: Number(r.delta),
    outcome: r.outcome as "won" | "lost" | "void",
    recordedAt: r.recorded_at as string,
  }));
}

// The competition's showpiece result (the final) — for the archive header.
export async function getFinalMatch(
  competition: SoccerCompetition,
): Promise<MatchRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select(MATCH_SELECT)
    .eq("competition", competition)
    .eq("stage", "final")
    .eq("finished", true)
    .order("datetime", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as unknown as RawMatch | undefined;
  return row ? toMatchRow(row) : null;
}
