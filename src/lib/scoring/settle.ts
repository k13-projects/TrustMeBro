import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { MARKET_TO_FIELD } from "@/lib/analysis/market-field";
import type { BetStatus, PropMarket } from "@/lib/analysis/types";
import { applyReward } from "./reward";

type PendingPrediction = {
  id: string;
  game_id: number;
  player_id: number;
  market: PropMarket;
  line: number;
  pick: "over" | "under";
};

type GameStatRow = {
  game_id: number;
  player_id: number;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  fg3m: number | null;
};

export type SettleResult = {
  considered: number;
  settled: number;
  won: number;
  lost: number;
  void: number;
};

/**
 * Resolve a single prediction against an actual box-score row.
 *
 * Rules (per CLAUDE.md):
 *  - No stat row, minutes is null, or minutes === 0  → void (DNP).
 *  - result_value null                                → void.
 *  - line push (result_value === line)                → void.
 *  - over hit / under hit                             → won.
 *  - otherwise                                        → lost.
 *
 * Minutes market special case: a DNP voids both sides — you don't get to win
 * an under by not appearing. The `null/0 minutes` branch above covers it for
 * every market including minutes.
 */
export function resolveOutcome(
  pending: PendingPrediction,
  stat: GameStatRow | null,
): { outcome: BetStatus; result_value: number | null } {
  if (!stat || stat.minutes === null || stat.minutes === 0) {
    return { outcome: "void", result_value: null };
  }
  const field = MARKET_TO_FIELD[pending.market] as keyof GameStatRow;
  const raw = stat[field];
  const value = typeof raw === "number" ? raw : null;
  if (value === null) return { outcome: "void", result_value: null };
  if (value === pending.line) return { outcome: "void", result_value: value };
  const over = value > pending.line;
  const hit = pending.pick === "over" ? over : !over;
  return { outcome: hit ? "won" : "lost", result_value: value };
}

/**
 * Settle every pending prediction whose game is now final.
 *
 * Idempotent: re-running on the same data is a no-op because the
 * `status='pending'` filter excludes already-settled rows.
 */
export async function settlePending(): Promise<SettleResult> {
  const supabase = supabaseAdmin();

  const { data: rawPending, error: pendingErr } = await supabase
    .from("predictions")
    .select(
      "id, game_id, player_id, market, line, pick, games!inner(status)",
    )
    .eq("status", "pending");
  if (pendingErr) throw new Error(`load pending: ${pendingErr.message}`);

  type RawRow = PendingPrediction & {
    games: { status: string } | { status: string }[] | null;
  };
  const pending = (rawPending ?? [])
    .map((r) => {
      const row = r as unknown as RawRow;
      const games = Array.isArray(row.games) ? row.games[0] : row.games;
      const status = games?.status?.toLowerCase() ?? "";
      if (!status.includes("final")) return null;
      return {
        id: row.id,
        game_id: row.game_id,
        player_id: row.player_id,
        market: row.market,
        line: row.line,
        pick: row.pick,
      } satisfies PendingPrediction;
    })
    .filter((r): r is PendingPrediction => r !== null);

  if (pending.length === 0) {
    return { considered: 0, settled: 0, won: 0, lost: 0, void: 0 };
  }

  const gameIds = Array.from(new Set(pending.map((p) => p.game_id)));
  const playerIds = Array.from(new Set(pending.map((p) => p.player_id)));

  const { data: stats, error: statsErr } = await supabase
    .from("player_game_stats")
    .select(
      "game_id, player_id, minutes, points, rebounds, assists, steals, blocks, fg3m",
    )
    .in("game_id", gameIds)
    .in("player_id", playerIds);
  if (statsErr) throw new Error(`load stats: ${statsErr.message}`);

  const statByKey = new Map<string, GameStatRow>();
  for (const s of (stats ?? []) as GameStatRow[]) {
    statByKey.set(`${s.game_id}:${s.player_id}`, s);
  }

  let won = 0;
  let lost = 0;
  let voided = 0;
  let settled = 0;

  for (const p of pending) {
    const stat = statByKey.get(`${p.game_id}:${p.player_id}`) ?? null;
    const { outcome, result_value } = resolveOutcome(p, stat);

    const { error: predUpdErr } = await supabase
      .from("predictions")
      .update({
        status: outcome,
        result_value,
        settled_at: new Date().toISOString(),
      })
      .eq("id", p.id);
    if (predUpdErr) {
      throw new Error(`update prediction ${p.id}: ${predUpdErr.message}`);
    }

    const { error: userUpdErr } = await supabase
      .from("user_bets")
      .update({
        status: outcome,
        result_value,
        settled_at: new Date().toISOString(),
      })
      .eq("prediction_id", p.id)
      .eq("status", "pending");
    if (userUpdErr) {
      throw new Error(`mirror user_bets for ${p.id}: ${userUpdErr.message}`);
    }

    if (outcome === "won") won++;
    else if (outcome === "lost") lost++;
    else voided++;
    settled++;

    if (outcome === "won" || outcome === "lost") {
      await applyReward({ prediction_id: p.id, outcome });
    }
  }

  return { considered: pending.length, settled, won, lost, void: voided };
}
