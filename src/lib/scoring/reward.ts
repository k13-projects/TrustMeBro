import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
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
 * Uses two writes (no transaction): if the second fails, the live score may
 * drift from history. Acceptable for MVP — settlement is replayable from
 * predictions.status. Revisit if/when score becomes user-facing money.
 */
export async function applyReward(args: {
  prediction_id: string;
  outcome: BetStatus;
}) {
  const { prediction_id, outcome } = args;
  const delta = rewardDelta(outcome);
  if (delta === 0 && outcome !== "won" && outcome !== "lost") return null;

  const supabase = await createSupabaseServerClient();

  const { data: current, error: readErr } = await supabase
    .from("system_score")
    .select("score, wins, losses, voids")
    .eq("id", true)
    .single();
  if (readErr) throw readErr;

  const next = {
    score: Number(current.score) + delta,
    wins: current.wins + (outcome === "won" ? 1 : 0),
    losses: current.losses + (outcome === "lost" ? 1 : 0),
    voids: current.voids + (outcome === "void" ? 1 : 0),
    updated_at: new Date().toISOString(),
  };

  const { error: updErr } = await supabase
    .from("system_score")
    .update(next)
    .eq("id", true);
  if (updErr) throw updErr;

  const { error: histErr } = await supabase
    .from("system_score_history")
    .insert({
      prediction_id,
      delta,
      outcome,
      score_after: next.score,
    });
  if (histErr) throw histErr;

  return next;
}
