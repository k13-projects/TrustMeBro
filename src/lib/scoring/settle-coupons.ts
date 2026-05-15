import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BetStatus } from "@/lib/analysis/types";

export type SettleCouponsResult = {
  considered: number;
  settled: number;
  won: number;
  lost: number;
  void: number;
};

type CouponRow = {
  id: string;
  mode: "power" | "flex";
  stake: number | string;
  payout_multiplier: number | string;
  potential_payout: number | string;
};

type CouponPickRow = {
  coupon_id: string;
  prediction_id: string;
  prediction: { status: BetStatus } | { status: BetStatus }[] | null;
};

/**
 * Settle saved user_coupons whose linked predictions are now all final.
 *
 * MVP rules:
 *  - Power: every pick must be 'won' to win. Any 'lost' → coupon 'lost'.
 *    Any 'void' (without a 'lost') → coupon 'void' (refund the stake).
 *  - Flex: same as Power for v1. PrizePicks Flex actually pays a tiered
 *    multiplier for N-of-M hits; modelling that requires per-tier rates we
 *    don't store yet, so we treat Flex like Power until that ships.
 *
 * Does NOT call applyReward — engine system_score is for engine per-pick
 * performance, not user wagers.
 */
export async function settleCoupons(): Promise<SettleCouponsResult> {
  const supabase = supabaseAdmin();

  const { data: pendingCoupons, error: cErr } = await supabase
    .from("user_coupons")
    .select("id, mode, stake, payout_multiplier, potential_payout")
    .eq("status", "pending");
  if (cErr) throw new Error(`load pending coupons: ${cErr.message}`);
  const coupons = (pendingCoupons ?? []) as CouponRow[];
  if (coupons.length === 0) {
    return { considered: 0, settled: 0, won: 0, lost: 0, void: 0 };
  }

  const couponIds = coupons.map((c) => c.id);
  const { data: pickRows, error: pErr } = await supabase
    .from("user_coupon_picks")
    .select("coupon_id, prediction_id, prediction:predictions(status)")
    .in("coupon_id", couponIds);
  if (pErr) throw new Error(`load coupon picks: ${pErr.message}`);

  const picksByCoupon = new Map<string, BetStatus[]>();
  for (const raw of (pickRows ?? []) as CouponPickRow[]) {
    const pred = Array.isArray(raw.prediction)
      ? (raw.prediction[0] ?? null)
      : raw.prediction;
    if (!pred) continue;
    const list = picksByCoupon.get(raw.coupon_id) ?? [];
    list.push(pred.status);
    picksByCoupon.set(raw.coupon_id, list);
  }

  let won = 0;
  let lost = 0;
  let voided = 0;
  let settled = 0;

  for (const coupon of coupons) {
    const statuses = picksByCoupon.get(coupon.id) ?? [];
    if (statuses.length === 0) continue;
    if (statuses.some((s) => s === "pending")) continue;

    let outcome: BetStatus;
    let resultPayout: number;
    const stake = Number(coupon.stake);
    const potential = Number(coupon.potential_payout);
    if (statuses.some((s) => s === "lost")) {
      outcome = "lost";
      resultPayout = 0;
    } else if (statuses.some((s) => s === "void")) {
      outcome = "void";
      resultPayout = stake;
    } else {
      outcome = "won";
      resultPayout = potential;
    }

    const { error: updErr } = await supabase
      .from("user_coupons")
      .update({
        status: outcome,
        result_payout: resultPayout,
        settled_at: new Date().toISOString(),
      })
      .eq("id", coupon.id)
      .eq("status", "pending");
    if (updErr) throw new Error(`update coupon ${coupon.id}: ${updErr.message}`);

    if (outcome === "won") won++;
    else if (outcome === "lost") lost++;
    else voided++;
    settled++;
  }

  return { considered: coupons.length, settled, won, lost, void: voided };
}
