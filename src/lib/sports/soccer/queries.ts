import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import { sideLabel } from "./labels";
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
  winner_team_id: number | null;
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
  winner_team_id: number | null;
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
    winner_team_id: m.winner_team_id ?? null,
  };
}

const TEAM_COLS = "id, name, abbreviation, crest_url, color";
const MATCH_SELECT =
  "id, competition, date, datetime, state, status, clock, stage, grp, venue, home_score, away_score, finished, winner_team_id, " +
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

// A stage that spans a whole single-table regular season with one constant
// slug (UEFA's literal "league-phase", or a domestic league's ESPN
// season.slug, e.g. Süper Lig's "2026-27-turkish-super-lig") has no round
// number in the payload, so ISO week stands in for matchday. Named stages
// that already carry real bracket/group structure — qualifying rounds,
// knockout rounds, and the World Cup's "group-stage" — keep their own
// stage-keyed bucket instead.
function isLeaguePhaseStage(stage: string | null): boolean {
  return (
    !!stage &&
    stage !== "group-stage" &&
    !QUALIFYING_STAGES.has(stage) &&
    !(stage in KNOCKOUT_LABEL)
  );
}

export function groupIntoRounds(matches: MatchRow[]): Round[] {
  const byKey = new Map<string, Round>();
  const leagueWeeks = [
    ...new Set(
      matches.filter((m) => isLeaguePhaseStage(m.stage)).map((m) => isoWeekKey(m.date)),
    ),
  ].sort();

  for (const m of matches) {
    let key: string;
    let label: string;
    let kind: Round["kind"];
    if (isLeaguePhaseStage(m.stage)) {
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
  /** Final score, once the match has been played — null while it is pending. */
  home_score: number | null;
  away_score: number | null;
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
    | RawPredictionMatch
    | RawPredictionMatch[]
    | null;
};

type RawPredictionMatch = {
  datetime: string | null;
  stage: string | null;
  finished: boolean | null;
  home_score: number | null;
  away_score: number | null;
  home: RawTeam | RawTeam[] | null;
  away: RawTeam | RawTeam[] | null;
};

const PREDICTION_SELECT =
  "id, competition, match_id, market, side, line, confidence, best_odds, expected_value, is_banko, status, " +
  "soccer_matches(datetime, stage, finished, home_score, away_score, " +
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
    home_score: match?.finished ? (match.home_score ?? null) : null,
    away_score: match?.finished ? (match.away_score ?? null) : null,
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
  /** Which match moved the ledger, so a step on the chart can be explained. */
  matchId: number | null;
  matchup: string | null;
  pick: string | null;
};

// Running net-units history for a competition's ledger — the time series the
// scoreboard chart plots (same shape as the NBA `system_score_history`).
export async function getSoccerScoreHistory(
  competition: SoccerCompetition,
): Promise<SoccerScorePoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_system_score_history")
    .select(
      "delta, outcome, score_after, recorded_at, " +
        "soccer_predictions(market, side, line, match_id, " +
        "soccer_matches(home_score, away_score, " +
        "home:soccer_teams!soccer_matches_home_team_id_fkey(name), " +
        "away:soccer_teams!soccer_matches_away_team_id_fkey(name)))",
    )
    .eq("competition", competition)
    .order("recorded_at", { ascending: true })
    .limit(500);

  type RawHistoryPrediction = {
    market: SoccerMarket;
    side: MatchSide;
    line: number | null;
    match_id: number;
    soccer_matches:
      | {
          home_score: number;
          away_score: number;
          home: { name: string } | { name: string }[] | null;
          away: { name: string } | { name: string }[] | null;
        }
      | Array<{
          home_score: number;
          away_score: number;
          home: { name: string } | { name: string }[] | null;
          away: { name: string } | { name: string }[] | null;
        }>
      | null;
  };

  return ((data ?? []) as unknown as Array<{
    delta: number;
    outcome: string;
    score_after: number;
    recorded_at: string;
    soccer_predictions: RawHistoryPrediction | RawHistoryPrediction[] | null;
  }>).map((r) => {
    const pred = one(r.soccer_predictions);
    const match = one(pred?.soccer_matches ?? null);
    const home = one(match?.home ?? null)?.name ?? null;
    const away = one(match?.away ?? null)?.name ?? null;
    return {
      scoreAfter: Number(r.score_after),
      delta: Number(r.delta),
      outcome: r.outcome as "won" | "lost" | "void",
      recordedAt: r.recorded_at,
      matchId: pred?.match_id ?? null,
      matchup:
        home && away && match
          ? `${home} ${match.home_score}–${match.away_score} ${away}`
          : null,
      pick:
        pred && home && away
          ? sideLabel(pred.market, pred.side, pred.line, home, away)
          : null,
    };
  });
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

// ---------------------------------------------------------------------------
// Match page
// ---------------------------------------------------------------------------
export async function getMatchById(id: number): Promise<MatchRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select(MATCH_SELECT)
    .eq("id", id)
    .maybeSingle();
  return data ? toMatchRow(data as unknown as RawMatch) : null;
}

// Every engine pick on a match, pending or graded, strongest first.
export async function getPredictionsForMatch(matchId: number): Promise<PredictionDetail[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_predictions")
    .select(PREDICTION_SELECT)
    .eq("match_id", matchId)
    .order("confidence", { ascending: false });
  return ((data ?? []) as unknown as RawPrediction[]).map(toPredictionDetail);
}

export type OddsPoint = {
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  prob: number;
  bestOdds: number | null;
  bookCount: number;
  capturedAt: string;
};

// The movement series: one consensus point per (market, side) per odds pull,
// oldest first. Empty until the match has been priced at least once.
export async function getOddsHistory(matchId: number): Promise<OddsPoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_odds_history")
    .select("market, side, line, prob, best_odds, book_count, captured_at")
    .eq("match_id", matchId)
    .order("captured_at", { ascending: true })
    .limit(600);
  return (data ?? []).map((r) => ({
    market: r.market as SoccerMarket,
    side: r.side as MatchSide,
    line: r.line === null ? null : Number(r.line),
    prob: Number(r.prob),
    bestOdds: r.best_odds === null ? null : Number(r.best_odds),
    bookCount: Number(r.book_count),
    capturedAt: r.captured_at as string,
  }));
}

// Previous meetings between two clubs that we have on record (any competition).
export async function getHeadToHead(
  teamA: number,
  teamB: number,
  excludeMatchId?: number,
): Promise<MatchRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select(MATCH_SELECT)
    .or(
      `and(home_team_id.eq.${teamA},away_team_id.eq.${teamB}),and(home_team_id.eq.${teamB},away_team_id.eq.${teamA})`,
    )
    .eq("finished", true)
    .order("datetime", { ascending: false })
    .limit(10);
  return ((data ?? []) as unknown as RawMatch[])
    .map(toMatchRow)
    .filter((m) => m.id !== excludeMatchId);
}

export type NewsLite = {
  id: number;
  source_url: string | null;
  outlet: string;
  headline: string | null;
  summary: string;
  image_url: string | null;
  is_engine_take: boolean;
  published_at: string;
};

const NEWS_COLS =
  "id, source_url, outlet, headline, summary, image_url, is_engine_take, published_at";

export async function getNewsForMatch(
  matchId: number,
  teamIds: number[],
  limit = 8,
): Promise<NewsLite[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_news")
    .select(NEWS_COLS)
    .or(`match_id.eq.${matchId},team_ids.ov.{${teamIds.join(",")}}`)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as NewsLite[];
}

export async function getNewsForTeam(teamId: number, limit = 10): Promise<NewsLite[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_news")
    .select(NEWS_COLS)
    .contains("team_ids", [teamId])
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as NewsLite[];
}

// ---------------------------------------------------------------------------
// Club page
// ---------------------------------------------------------------------------
export type TeamRow = TeamLite & { country: string; alt_color: string | null };

export async function getTeamById(id: number): Promise<TeamRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_teams")
    .select("id, name, abbreviation, country, crest_url, color, alt_color")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    abbreviation: data.abbreviation,
    country: data.country,
    crest: data.crest_url,
    color: data.color,
    alt_color: data.alt_color,
  };
}

// A club's fixtures + results on record across every competition we track,
// newest first.
export async function getMatchesForTeam(teamId: number, limit = 60): Promise<MatchRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select(MATCH_SELECT)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("datetime", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as RawMatch[]).map(toMatchRow);
}

// Every engine pick on this club's matches (either side), newest first.
export async function getPredictionsForTeam(
  teamId: number,
  limit = 30,
): Promise<PredictionDetail[]> {
  const supabase = await createSupabaseServerClient();
  const { data: matches } = await supabase
    .from("soccer_matches")
    .select("id")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .limit(300);
  const ids = (matches ?? []).map((m) => m.id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("soccer_predictions")
    .select(PREDICTION_SELECT)
    .in("match_id", ids)
    .order("generated_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as RawPrediction[]).map(toPredictionDetail);
}

// Latest table line for a team in a competition (null if not in a table).
export async function getStandingForTeam(
  competition: SoccerCompetition,
  teamId: number,
): Promise<StandingRow | null> {
  const byGroup = await getStandings(competition);
  for (const rows of byGroup.values()) {
    const hit = rows.find((r) => r.team.id === teamId);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Engine record breakdown (scoreboard)
// ---------------------------------------------------------------------------
export type BreakdownCell = {
  key: string;
  label: string;
  won: number;
  lost: number;
  voided: number;
  units: number; // +1 / −1 ledger
  roi: number | null; // flat 1u stakes at best_odds, null if nothing decisive
};

export type EngineBreakdown = {
  byMarket: BreakdownCell[];
  bySide: BreakdownCell[]; // favourite vs underdog vs draw (match result only)
  byVenue: BreakdownCell[]; // home / away picks (match result only)
  byPrice: BreakdownCell[]; // odds buckets
  byConfidence: BreakdownCell[]; // confidence bands
  settled: number;
};

function cell(key: string, label: string): BreakdownCell {
  return { key, label, won: 0, lost: 0, voided: 0, units: 0, roi: null };
}

function finish(cells: Map<string, BreakdownCell & { staked: number; returned: number }>) {
  return [...cells.values()].map((c) => ({
    key: c.key,
    label: c.label,
    won: c.won,
    lost: c.lost,
    voided: c.voided,
    units: c.units,
    roi: c.staked > 0 ? (c.returned - c.staked) / c.staked : null,
  }));
}

export async function getEngineBreakdown(
  competition: SoccerCompetition,
): Promise<EngineBreakdown> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_predictions")
    .select("market, side, line, confidence, best_odds, status")
    .eq("competition", competition)
    .in("status", ["won", "lost", "void"])
    .limit(5000);

  type Bucket = Map<string, BreakdownCell & { staked: number; returned: number }>;
  const mk = (): Bucket => new Map();
  const byMarket = mk();
  const bySide = mk();
  const byVenue = mk();
  const byPrice = mk();
  const byConfidence = mk();
  const bump = (b: Bucket, key: string, label: string, status: string, odds: number) => {
    let c = b.get(key);
    if (!c) {
      c = { ...cell(key, label), staked: 0, returned: 0 };
      b.set(key, c);
    }
    if (status === "won") {
      c.won += 1;
      c.units += 1;
      c.staked += 1;
      c.returned += odds;
    } else if (status === "lost") {
      c.lost += 1;
      c.units -= 1;
      c.staked += 1;
    } else {
      c.voided += 1;
    }
  };

  const MARKET_LABEL: Record<string, string> = {
    match_winner: "Match result",
    total_goals: "Total goals",
    btts: "Both teams to score",
  };
  let settled = 0;
  for (const r of data ?? []) {
    settled += 1;
    const odds = Number(r.best_odds);
    const status = r.status as string;
    const market = r.market as string;
    bump(byMarket, market, MARKET_LABEL[market] ?? market, status, odds);

    if (market === "match_winner") {
      const side = r.side as string;
      bump(byVenue, side, side === "home" ? "Home side" : side === "away" ? "Away side" : "Draw", status, odds);
      const tag = side === "draw" ? "draw" : odds <= 1.6 ? "fav" : odds <= 2.3 ? "even" : "dog";
      const label =
        tag === "draw" ? "Draws" : tag === "fav" ? "Favourites (≤1.60)" : tag === "even" ? "Toss-ups (1.61–2.30)" : "Underdogs (>2.30)";
      bump(bySide, tag, label, status, odds);
    }

    const pb = odds < 1.4 ? "a" : odds < 1.8 ? "b" : odds < 2.5 ? "c" : "d";
    const pl = pb === "a" ? "Under 1.40" : pb === "b" ? "1.40–1.79" : pb === "c" ? "1.80–2.49" : "2.50 and up";
    bump(byPrice, pb, pl, status, odds);

    const conf = Number(r.confidence);
    const cb = conf >= 75 ? "a" : conf >= 60 ? "b" : conf >= 50 ? "c" : "d";
    const cl = cb === "a" ? "75%+" : cb === "b" ? "60–74%" : cb === "c" ? "50–59%" : "Under 50%";
    bump(byConfidence, cb, cl, status, odds);
  }

  const order = (cells: BreakdownCell[], keys: string[]) =>
    cells.sort((x, y) => keys.indexOf(x.key) - keys.indexOf(y.key));

  return {
    byMarket: order(finish(byMarket), ["match_winner", "total_goals", "btts"]),
    bySide: order(finish(bySide), ["fav", "even", "dog", "draw"]),
    byVenue: order(finish(byVenue), ["home", "away", "draw"]),
    byPrice: order(finish(byPrice), ["a", "b", "c", "d"]),
    byConfidence: order(finish(byConfidence), ["a", "b", "c", "d"]),
    settled,
  };
}
