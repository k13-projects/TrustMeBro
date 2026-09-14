import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRequester } from "@/lib/identity";
import type { SoccerCompetition } from "./competitions";

// Read-side helpers for the Bro predictions game (score calls). Separate from
// ./queries.ts because that file is owned by another engineer mid-edit.

export type OwnScoreCall = {
  match_id: number;
  home_goals: number;
  away_goals: number;
  points: number | null;
  graded_at: string | null;
};

// The requester's own calls for a set of matches. Guests aren't RLS-legible
// for a plain select (their rows carry user_id null), so they read through
// the admin client scoped to their own guest_name — same identity split used
// everywhere else (see lib/identity.ts).
export async function getOwnScoreCalls(
  matchIds: number[],
): Promise<Map<number, OwnScoreCall>> {
  const map = new Map<number, OwnScoreCall>();
  if (matchIds.length === 0) return map;
  const requester = await getRequester();
  if (!requester) return map;

  const reader =
    requester.kind === "auth" ? await createSupabaseServerClient() : supabaseAdmin();
  let query = reader
    .from("soccer_score_predictions")
    .select("match_id, home_goals, away_goals, points, graded_at")
    .in("match_id", matchIds);
  query =
    requester.kind === "auth"
      ? query.eq("user_id", requester.user_id)
      : query.eq("guest_name", requester.guest_name);
  const { data, error } = await query;
  if (error) throw new Error(`load own score calls: ${error.message}`);
  for (const row of (data ?? []) as OwnScoreCall[]) {
    map.set(row.match_id, row);
  }
  return map;
}

export type PublicCallSummary = {
  match_id: number;
  count: number;
  home: number;
  draw: number;
  away: number;
};

type PublicCallRow = {
  match_id: number;
  home_goals: number;
  away_goals: number;
  soccer_matches:
    | { datetime: string | null }
    | { datetime: string | null }[]
    | null;
};

// Distribution of signed-in bros' calls, kicked-off matches only. RLS already
// hides pre-kickoff rows belonging to *other* people, but a signed-in viewer
// can still see their *own* pre-kickoff row under the "user reads own" policy
// — so we also filter by datetime ourselves, to keep a "locked" summary from
// ever showing before the match has actually locked.
export async function getPublicCallSummary(
  matchIds: number[],
): Promise<Map<number, PublicCallSummary>> {
  const map = new Map<number, PublicCallSummary>();
  if (matchIds.length === 0) return map;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("soccer_score_predictions")
    .select("match_id, home_goals, away_goals, soccer_matches!inner(datetime)")
    .in("match_id", matchIds)
    .not("user_id", "is", null);
  if (error) throw new Error(`load public call summary: ${error.message}`);

  const now = Date.now();
  for (const row of (data ?? []) as unknown as PublicCallRow[]) {
    const match = Array.isArray(row.soccer_matches)
      ? (row.soccer_matches[0] ?? null)
      : row.soccer_matches;
    if (!match?.datetime || new Date(match.datetime).getTime() > now) continue;
    const cur = map.get(row.match_id) ?? {
      match_id: row.match_id,
      count: 0,
      home: 0,
      draw: 0,
      away: 0,
    };
    cur.count += 1;
    if (row.home_goals > row.away_goals) cur.home += 1;
    else if (row.home_goals < row.away_goals) cur.away += 1;
    else cur.draw += 1;
    map.set(row.match_id, cur);
  }
  return map;
}

// Sum of the requester's own calls across a whole competition (not just the
// matches on screen) — the "your running points" header on the board. Works
// for both auth and guest identities, unlike the leaderboard view below,
// which only tracks signed-in bros.
export type OwnCompetitionStats = {
  calls: number;
  graded: number;
  points: number;
  exact_scores: number;
  right_results: number;
};

export async function getOwnCompetitionStats(
  competition: SoccerCompetition,
): Promise<OwnCompetitionStats | null> {
  const requester = await getRequester();
  if (!requester) return null;
  const reader =
    requester.kind === "auth" ? await createSupabaseServerClient() : supabaseAdmin();
  let query = reader
    .from("soccer_score_predictions")
    .select("points")
    .eq("competition", competition);
  query =
    requester.kind === "auth"
      ? query.eq("user_id", requester.user_id)
      : query.eq("guest_name", requester.guest_name);
  const { data, error } = await query;
  if (error) throw new Error(`load own competition stats: ${error.message}`);
  const rows = (data ?? []) as Array<{ points: number | null }>;
  const graded = rows.filter((r) => r.points !== null);
  return {
    calls: rows.length,
    graded: graded.length,
    points: graded.reduce((sum, r) => sum + Number(r.points ?? 0), 0),
    exact_scores: graded.filter((r) => Number(r.points) === 3).length,
    right_results: graded.filter((r) => Number(r.points) >= 1).length,
  };
}

export type LeaderboardProfile = {
  handle: string;
  display_name: string;
  avatar_url: string | null;
};

export type LeaderboardRow = {
  user_id: string;
  calls: number;
  graded: number;
  points: number;
  exact_scores: number;
  right_results: number;
  profile: LeaderboardProfile | null;
};

// Top N of soccer_prediction_leaderboard (migration 0024), joined to profiles
// for handle/avatar. Signed-in bros only — guests never appear here (same
// rule as shared coupons: a public row needs a real user_id).
export async function loadPredictionLeaderboard(
  competition: SoccerCompetition,
  limit = 25,
): Promise<LeaderboardRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("soccer_prediction_leaderboard")
    .select("user_id, calls, graded, points, exact_scores, right_results")
    .eq("competition", competition)
    .order("points", { ascending: false })
    .order("exact_scores", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`load prediction leaderboard: ${error.message}`);
  const rows = (data ?? []) as Array<{
    user_id: string;
    calls: number | string;
    graded: number | string;
    points: number | string;
    exact_scores: number | string;
    right_results: number | string;
  }>;
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("user_id, handle, display_name, avatar_url")
    .in("user_id", userIds);
  if (pErr) throw new Error(`load leaderboard profiles: ${pErr.message}`);
  const byId = new Map<string, LeaderboardProfile>(
    ((profiles ?? []) as Array<{ user_id: string } & LeaderboardProfile>).map(
      (p) => [p.user_id, { handle: p.handle, display_name: p.display_name, avatar_url: p.avatar_url }],
    ),
  );

  return rows.map((r) => ({
    user_id: r.user_id,
    calls: Number(r.calls),
    graded: Number(r.graded),
    points: Number(r.points),
    exact_scores: Number(r.exact_scores),
    right_results: Number(r.right_results),
    profile: byId.get(r.user_id) ?? null,
  }));
}
