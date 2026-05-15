import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BetStatus } from "@/lib/analysis/types";

const WIN_DELTA = 1.0;
const LOSS_DELTA = -0.5;

export function rewardDelta(outcome: BetStatus): number {
  if (outcome === "won") return WIN_DELTA;
  if (outcome === "lost") return LOSS_DELTA;
  return 0;
}

/**
 * Apply the +1.0 / -0.5 reward to system_score and append a history row.
 * Called by `/api/cron/settle-bets` after a prediction is settled.
 *
 * Runs the score update and history insert inside a single Postgres
 * function (migration 0008) so the two writes can't drift. The 0003
 * partial unique index on system_score_history still blocks double-credit
 * if settle-bets retries the same prediction.
 */
export async function applyReward(args: {
  prediction_id: string;
  outcome: BetStatus;
}) {
  const { prediction_id, outcome } = args;
  if (outcome !== "won" && outcome !== "lost" && outcome !== "void") {
    return null;
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.rpc("apply_reward", {
    p_prediction_id: prediction_id,
    p_outcome: outcome,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    score: Number(row.score),
    wins: Number(row.wins),
    losses: Number(row.losses),
    voids: Number(row.voids),
  };
}
