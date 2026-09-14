import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SoccerCompetition } from "./competitions";
import type { MatchRow, Round, StandingRow } from "./queries";

// Data shaping for the football home page. The section has to read well in
// three very different states: a matchday in progress, a matchday days away,
// and the month-long gap between rounds that European competitions leave.

// ---------------------------------------------------------------------------
// Round selection
// ---------------------------------------------------------------------------

/** The next round that has not started, by calendar date. */
export function nextUpcomingRound(rounds: Round[], today: string): Round | null {
  return rounds.find((r) => r.from > today) ?? null;
}

/** The most recent round with at least one result, already past. */
export function lastCompletedRound(rounds: Round[], today: string): Round | null {
  const past = rounds.filter((r) => r.to <= today && r.played > 0);
  return past.length > 0 ? past[past.length - 1] : null;
}

/** A round counts as "in focus" while it is running or within `hours` of starting. */
export function roundIsImminent(round: Round | null, hours = 48): boolean {
  if (!round) return false;
  const start = new Date(`${round.from}T00:00:00Z`).getTime();
  return start - Date.now() <= hours * 3600 * 1000;
}

/**
 * Whole days from now until a moment, floored at zero. Accepts either a
 * calendar date (anchored at midday so a timezone can't shift the count) or a
 * full ISO timestamp, so the headline figure and the ticking countdown agree.
 */
export function daysUntil(when: string): number {
  const iso = when.includes("T") ? when : `${when}T12:00:00Z`;
  const ms = new Date(iso).getTime() - Date.now();
  // Floor, so "29 days and 12 hours away" reads as 29 days here and in the
  // ticking countdown rather than disagreeing with it.
  return Math.max(0, Math.floor(ms / (24 * 3600 * 1000)));
}

// ---------------------------------------------------------------------------
// Table movement, derived from results
// ---------------------------------------------------------------------------
// Every standings snapshot we hold was captured after the last round finished,
// so diffing snapshots shows no movement. Instead we take the current table
// and subtract the round's own results to recover the table as it stood
// before kickoff, then compare. Pure, so it can be reasoned about directly.

export type TableMove = {
  row: StandingRow;
  previousRank: number | null; // null when the team had not played yet
  delta: number | null; // positive = climbed
  pointsGained: number;
};

type Tally = {
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

function tallyFrom(row: StandingRow): Tally {
  return {
    played: row.played,
    won: row.won,
    draw: row.draw,
    lost: row.lost,
    goalsFor: row.goals_for,
    goalsAgainst: row.goals_against,
    points: row.points,
  };
}

export function deriveMovement(
  current: StandingRow[],
  roundMatches: MatchRow[],
): { moves: TableMove[]; firstTable: boolean } {
  const before = new Map<number, Tally>();
  for (const row of current) before.set(row.team.id, tallyFrom(row));

  const gained = new Map<number, number>();
  for (const m of roundMatches) {
    if (!m.finished) continue;
    const sides: Array<[number, number, number]> = [
      [m.home.id, m.home_score, m.away_score],
      [m.away.id, m.away_score, m.home_score],
    ];
    for (const [teamId, gf, ga] of sides) {
      const t = before.get(teamId);
      const won = gf > ga;
      const drew = gf === ga;
      const points = won ? 3 : drew ? 1 : 0;
      gained.set(teamId, (gained.get(teamId) ?? 0) + points);
      if (!t) continue;
      t.played -= 1;
      t.goalsFor -= gf;
      t.goalsAgainst -= ga;
      t.points -= points;
      if (won) t.won -= 1;
      else if (drew) t.draw -= 1;
      else t.lost -= 1;
    }
  }

  // Teams with nothing played before the round have no prior position.
  const ranked = [...before.entries()]
    .filter(([, t]) => t.played > 0)
    .sort((a, b) => {
      const [, x] = a;
      const [, y] = b;
      return (
        y.points - x.points ||
        y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) ||
        y.goalsFor - x.goalsFor
      );
    });
  const previousRank = new Map<number, number>();
  ranked.forEach(([teamId], i) => previousRank.set(teamId, i + 1));

  const moves: TableMove[] = current.map((row) => {
    const prev = previousRank.get(row.team.id) ?? null;
    return {
      row,
      previousRank: prev,
      delta: prev === null ? null : prev - row.rank,
      pointsGained: gained.get(row.team.id) ?? 0,
    };
  });

  return { moves, firstTable: previousRank.size === 0 };
}

// ---------------------------------------------------------------------------
// What happened in the round
// ---------------------------------------------------------------------------

export type Highlight = {
  key: string;
  label: string;
  headline: string;
  detail: string;
  matchId: number | null;
};

export function roundHighlights(matches: MatchRow[]): Highlight[] {
  const played = matches.filter((m) => m.finished);
  if (played.length === 0) return [];
  const out: Highlight[] = [];

  const byMargin = [...played].sort(
    (a, b) =>
      Math.abs(b.home_score - b.away_score) - Math.abs(a.home_score - a.away_score),
  );
  const widest = byMargin[0];
  const margin = Math.abs(widest.home_score - widest.away_score);
  if (margin >= 2) {
    const winnerHome = widest.home_score > widest.away_score;
    out.push({
      key: "margin",
      label: "Biggest win",
      headline: `${winnerHome ? widest.home.name : widest.away.name} by ${margin}`,
      detail: `${widest.home.name} ${widest.home_score}–${widest.away_score} ${widest.away.name}`,
      matchId: widest.id,
    });
  }

  const byGoals = [...played].sort(
    (a, b) => b.home_score + b.away_score - (a.home_score + a.away_score),
  );
  const wildest = byGoals[0];
  const goals = wildest.home_score + wildest.away_score;
  if (goals >= 4 && wildest.id !== widest.id) {
    out.push({
      key: "goals",
      label: "Most goals",
      headline: `${goals} in one match`,
      detail: `${wildest.home.name} ${wildest.home_score}–${wildest.away_score} ${wildest.away.name}`,
      matchId: wildest.id,
    });
  }

  const overs = played.filter((m) => m.home_score + m.away_score > 2.5).length;
  out.push({
    key: "overs",
    label: "Goals across the round",
    headline: `${played.reduce((s, m) => s + m.home_score + m.away_score, 0)} goals in ${played.length} matches`,
    detail: `${overs} of ${played.length} went over 2.5`,
    matchId: null,
  });

  const awayWins = played.filter((m) => m.away_score > m.home_score).length;
  const draws = played.filter((m) => m.home_score === m.away_score).length;
  out.push({
    key: "shape",
    label: "How they finished",
    headline: `${played.length - awayWins - draws} home · ${draws} drawn · ${awayWins} away`,
    detail: "Results by venue",
    matchId: null,
  });

  return out.slice(0, 4);
}

// ---------------------------------------------------------------------------
// How the engine did on a round
// ---------------------------------------------------------------------------

export type RoundEngineSummary = {
  won: number;
  lost: number;
  voided: number;
  units: number;
  settled: number;
};

export async function getRoundEngineSummary(
  matchIds: number[],
): Promise<RoundEngineSummary | null> {
  if (matchIds.length === 0) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_predictions")
    .select("status")
    .in("match_id", matchIds)
    .in("status", ["won", "lost", "void"]);
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const won = rows.filter((r) => r.status === "won").length;
  const lost = rows.filter((r) => r.status === "lost").length;
  const voided = rows.filter((r) => r.status === "void").length;
  return { won, lost, voided, units: won - lost, settled: rows.length };
}

// ---------------------------------------------------------------------------
// Storylines
// ---------------------------------------------------------------------------

export type HomeNewsItem = {
  id: number;
  headline: string | null;
  summary: string;
  outlet: string;
  source_url: string | null;
  image_url: string | null;
  is_engine_take: boolean;
  published_at: string;
};

export async function getCompetitionNews(
  competition: SoccerCompetition,
  limit = 6,
): Promise<HomeNewsItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_news")
    .select(
      "id, headline, summary, outlet, source_url, image_url, is_engine_take, published_at",
    )
    .eq("competition", competition)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as HomeNewsItem[];
}
