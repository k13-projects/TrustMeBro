import "server-only";

import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type EngineStats = {
  /** wins + losses + voids + pending */
  total_picks: number;
  /** wins + losses + voids */
  total_settled: number;
  wins: number;
  losses: number;
  voids: number;
  pending: number;
  /** wins / (wins + losses) — null if nothing decisive yet */
  win_rate: number | null;
  /** Current `system_score.score` — net units at +1.0 / -0.5 grading */
  score: number;
  /** Sum of score deltas in the trailing 7 days */
  net_units_7d: number;
  /** Most-recent contiguous streak (from newest settlement back) */
  current_streak: { kind: "win" | "loss" | "none"; length: number };
  /** Earliest predictions.generated_at as ISO date (YYYY-MM-DD), or null */
  first_pick_date: string | null;
  /** Whole days since first_pick_date (0 if no picks yet) */
  days_tracked: number;
  /** Most recent settled Bet of the Day rows with outcome — for testimonial-style display */
  recent_botds: BotdResult[];
};

export type BotdResult = {
  prediction_id: string;
  player_first_name: string;
  player_last_name: string;
  market: string;
  pick: string;
  line: number;
  confidence: number;
  status: "won" | "lost" | "void" | "pending";
  result_value: number | null;
  settled_at: string | null;
  generated_at: string;
};

const EMPTY: EngineStats = {
  total_picks: 0,
  total_settled: 0,
  wins: 0,
  losses: 0,
  voids: 0,
  pending: 0,
  win_rate: null,
  score: 0,
  net_units_7d: 0,
  current_streak: { kind: "none", length: 0 },
  first_pick_date: null,
  days_tracked: 0,
  recent_botds: [],
};

/**
 * Single source of truth for engine performance numbers. Reads only
 * authoritative tables (`system_score`, `system_score_history`, `predictions`)
 * — no hardcoded fluff, no marketing inflation. If you see a number on the
 * site it should ultimately route through here.
 */
export const getEngineStats = cache(_getEngineStats);

async function _getEngineStats(): Promise<EngineStats> {
  const supabase = supabaseAdmin();

  const [
    { data: scoreRow },
    { data: statusCounts },
    { data: firstPick },
    { data: history7d },
    { data: recentSettlements },
    { data: recentBotds },
  ] = await Promise.all([
    supabase.from("system_score").select("score, wins, losses, voids").eq("id", true).maybeSingle(),
    supabase.from("predictions").select("status"),
    supabase
      .from("predictions")
      .select("generated_at")
      .order("generated_at", { ascending: true })
      .limit(1),
    supabase
      .from("system_score_history")
      .select("delta, recorded_at")
      .gte("recorded_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
    supabase
      .from("system_score_history")
      .select("outcome, recorded_at")
      .order("recorded_at", { ascending: false })
      .limit(50),
    supabase
      .from("predictions")
      .select(
        "id, market, line, pick, confidence, status, result_value, settled_at, generated_at, is_bet_of_the_day, player:players!inner(first_name, last_name)",
      )
      .eq("is_bet_of_the_day", true)
      .order("generated_at", { ascending: false })
      .limit(6),
  ]);

  if (!scoreRow && !statusCounts?.length) return EMPTY;

  const score = Number(scoreRow?.score ?? 0);
  const wins = Number(scoreRow?.wins ?? 0);
  const losses = Number(scoreRow?.losses ?? 0);
  const voids = Number(scoreRow?.voids ?? 0);

  // `pending` is sourced from the predictions table — only rows that haven't
  // been settled yet. Historical settled rows may have rolled off the table
  // (we keep the running tally on system_score), so the authoritative
  // settled count is wins+losses+voids from system_score, and total picks
  // is settled + currently-pending.
  const pending = (statusCounts ?? []).filter((p) => p.status === "pending").length;
  const total_settled = wins + losses + voids;
  const total_picks = total_settled + pending;

  const win_rate =
    wins + losses > 0 ? wins / (wins + losses) : null;

  const net_units_7d = (history7d ?? []).reduce(
    (s, r) => s + Number(r.delta ?? 0),
    0,
  );

  const current_streak = computeStreak(
    (recentSettlements ?? []) as Array<{ outcome: string }>,
  );

  const first_pick_date_iso = firstPick?.[0]?.generated_at ?? null;
  const first_pick_date = first_pick_date_iso
    ? first_pick_date_iso.slice(0, 10)
    : null;
  const days_tracked = first_pick_date
    ? Math.max(0, Math.floor((Date.now() - new Date(first_pick_date).getTime()) / (24 * 3600 * 1000)))
    : 0;

  const recent_botds: BotdResult[] = (recentBotds ?? []).map((r) => {
    const player = Array.isArray(r.player) ? r.player[0] : r.player;
    return {
      prediction_id: r.id,
      player_first_name: player?.first_name ?? "",
      player_last_name: player?.last_name ?? "",
      market: r.market,
      pick: r.pick,
      line: Number(r.line),
      confidence: Number(r.confidence),
      status: r.status as BotdResult["status"],
      result_value: r.result_value == null ? null : Number(r.result_value),
      settled_at: r.settled_at,
      generated_at: r.generated_at,
    };
  });

  return {
    total_picks,
    total_settled,
    wins,
    losses,
    voids,
    pending,
    win_rate,
    score,
    net_units_7d,
    current_streak,
    first_pick_date,
    days_tracked,
    recent_botds,
  };
}

function computeStreak(
  rows: Array<{ outcome: string }>,
): { kind: "win" | "loss" | "none"; length: number } {
  let kind: "win" | "loss" | "none" = "none";
  let length = 0;
  for (const r of rows) {
    if (r.outcome === "void") continue;
    const cur: "win" | "loss" = r.outcome === "won" ? "win" : "loss";
    if (kind === "none") {
      kind = cur;
      length = 1;
    } else if (kind === cur) {
      length += 1;
    } else {
      break;
    }
  }
  return { kind, length };
}
