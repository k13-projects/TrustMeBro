import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

type BetStatus = "pending" | "won" | "lost" | "void";

// Decide a single pick against a final score. null ⇒ push/void.
function outcome(
  market: SoccerMarket,
  side: MatchSide,
  line: number | null,
  home: number,
  away: number,
): { status: Exclude<BetStatus, "pending">; result: MatchSide } {
  if (market === "match_winner") {
    const result: MatchSide = home > away ? "home" : away > home ? "away" : "draw";
    return { status: side === result ? "won" : "lost", result };
  }
  if (market === "total_goals") {
    const total = home + away;
    const l = line ?? 0;
    const result: MatchSide = total > l ? "over" : "under";
    if (total === l) return { status: "void", result: side };
    return { status: side === result ? "won" : "lost", result };
  }
  // btts
  const both = home > 0 && away > 0;
  const result: MatchSide = both ? "yes" : "no";
  return { status: side === result ? "won" : "lost", result };
}

export type SettleResult = {
  predictions_settled: number;
  coupons_settled: number;
  score_delta: number;
};

export async function settleSoccer(): Promise<SettleResult> {
  const supabase = supabaseAdmin();

  // Pending predictions whose match has finished.
  const { data: rows, error } = await supabase
    .from("soccer_predictions")
    .select(
      "id, match_id, market, side, line, status, soccer_matches!inner(home_score, away_score, finished)",
    )
    .eq("status", "pending")
    .eq("soccer_matches.finished", true);
  if (error) throw new Error(`load pending predictions: ${error.message}`);
  if (!rows || rows.length === 0) {
    return { predictions_settled: 0, coupons_settled: 0, score_delta: 0 };
  }

  let wins = 0;
  let losses = 0;
  let voids = 0;
  const now = new Date().toISOString();

  for (const r of rows) {
    const match = r.soccer_matches as unknown as {
      home_score: number;
      away_score: number;
    };
    const { status, result } = outcome(
      r.market as SoccerMarket,
      r.side as MatchSide,
      r.line === null ? null : Number(r.line),
      match.home_score,
      match.away_score,
    );
    if (status === "won") wins += 1;
    else if (status === "lost") losses += 1;
    else voids += 1;

    await supabase
      .from("soccer_predictions")
      .update({ status, settled_side: result, settled_at: now })
      .eq("id", r.id);

    if (status !== "void") {
      const delta = status === "won" ? 1 : -1;
      const { data: scoreRow } = await supabase
        .from("soccer_system_score")
        .select("score")
        .eq("id", true)
        .single();
      const scoreAfter = Number(scoreRow?.score ?? 0) + delta;
      await supabase
        .from("soccer_system_score")
        .update({
          score: scoreAfter,
          updated_at: now,
        })
        .eq("id", true);
      await supabase.from("soccer_system_score_history").insert({
        prediction_id: r.id,
        delta,
        outcome: status,
        score_after: scoreAfter,
      });
    }
  }

  // Bump aggregate win/loss/void counts.
  const { data: agg } = await supabase
    .from("soccer_system_score")
    .select("wins, losses, voids")
    .eq("id", true)
    .single();
  await supabase
    .from("soccer_system_score")
    .update({
      wins: Number(agg?.wins ?? 0) + wins,
      losses: Number(agg?.losses ?? 0) + losses,
      voids: Number(agg?.voids ?? 0) + voids,
      updated_at: now,
    })
    .eq("id", true);

  const couponsSettled = await settleCoupons();

  return {
    predictions_settled: rows.length,
    coupons_settled: couponsSettled,
    score_delta: wins - losses,
  };
}

// A coupon resolves once all its legs are decided: any leg lost → lost;
// all legs won → won; all void → void. Mixed pending → leave pending.
async function settleCoupons(): Promise<number> {
  const supabase = supabaseAdmin();
  const { data: coupons, error } = await supabase
    .from("engine_coupons")
    .select("id, engine_coupon_legs(soccer_prediction_id)")
    .eq("sport", "soccer")
    .eq("status", "pending");
  if (error) throw new Error(`load coupons: ${error.message}`);
  if (!coupons || coupons.length === 0) return 0;

  const now = new Date().toISOString();
  let settled = 0;

  for (const c of coupons) {
    const legs = (c.engine_coupon_legs ?? []) as Array<{
      soccer_prediction_id: string;
    }>;
    const ids = legs.map((l) => l.soccer_prediction_id);
    if (ids.length === 0) continue;
    const { data: preds } = await supabase
      .from("soccer_predictions")
      .select("status")
      .in("id", ids);
    const statuses = (preds ?? []).map((p) => p.status as BetStatus);
    if (statuses.some((s) => s === "pending")) continue; // not ready

    const won = statuses.filter((s) => s === "won").length;
    const lost = statuses.filter((s) => s === "lost").length;
    const voided = statuses.filter((s) => s === "void").length;
    const status: BetStatus =
      lost > 0 ? "lost" : won > 0 ? "won" : "void";

    await supabase
      .from("engine_coupons")
      .update({
        status,
        legs_won: won,
        legs_lost: lost,
        legs_void: voided,
        settled_at: now,
      })
      .eq("id", c.id);
    settled += 1;
  }
  return settled;
}
