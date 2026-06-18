import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPayoutMap } from "@/lib/analysis/payouts";
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
  prediction: { status: BetStatus } | { status: BetStatus }[] | null;
};

/**
 * Settle saved user_coupons whose linked predictions are now all final.
 *
 * Rules (real-book style — a voided leg is DROPPED and the parlay re-prices
 * on the legs that actually graded, like a sportsbook):
 *  - Any surviving (non-void) leg 'lost' → coupon 'lost', pays 0.
 *  - All legs void → coupon 'void', refund the stake.
 *  - All survivors 'won', no voids → coupon 'won' at the locked-in payout.
 *  - All survivors 'won' but some legs voided → re-price on the surviving
 *    count: pay stake × the current multiplier for that smaller leg count
 *    (e.g. a 4-pick with 1 void pays at the 3-pick rate). If it drops below a
 *    valid parlay size (no multiplier for that count/mode — e.g. 2-pick → 1
 *    survivor) → refund the stake.
 *  - Flex is graded all-must-win like Power for now (we don't model N-of-M
 *    tiers yet) but re-prices at flex rates.
 *
 * Does NOT call applyReward — engine system_score is for engine per-pick
 * performance, not user wagers.
 */
export async function settleCoupons(): Promise<SettleCouponsResult> {
  return settleCouponsForSport("nba");
}

/**
 * Same grading rules as {@link settleCoupons}, for soccer user coupons. Their
 * legs live in soccer_coupon_legs (FK → soccer_predictions) and the parent
 * user_coupons row carries sport = 'soccer'.
 */
export async function settleSoccerCoupons(): Promise<SettleCouponsResult> {
  return settleCouponsForSport("soccer");
}

async function settleCouponsForSport(
  sport: "nba" | "soccer",
): Promise<SettleCouponsResult> {
  const supabase = supabaseAdmin();

  const { data: pendingCoupons, error: cErr } = await supabase
    .from("user_coupons")
    .select("id, mode, stake, payout_multiplier, potential_payout")
    .eq("status", "pending")
    .eq("sport", sport);
  if (cErr) throw new Error(`load pending coupons: ${cErr.message}`);
  const coupons = (pendingCoupons ?? []) as CouponRow[];
  if (coupons.length === 0) {
    return { considered: 0, settled: 0, won: 0, lost: 0, void: 0 };
  }

  const couponIds = coupons.map((c) => c.id);
  const legTable = sport === "soccer" ? "soccer_coupon_legs" : "user_coupon_picks";
  const legSelect =
    sport === "soccer"
      ? "coupon_id, prediction:soccer_predictions(status)"
      : "coupon_id, prediction:predictions(status)";
  const { data: pickRows, error: pErr } = await supabase
    .from(legTable)
    .select(legSelect)
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

  const payouts = await loadPayoutMap();

  let won = 0;
  let lost = 0;
  let voided = 0;
  let settled = 0;

  for (const coupon of coupons) {
    const statuses = picksByCoupon.get(coupon.id) ?? [];
    if (statuses.length === 0) continue;
    if (statuses.some((s) => s === "pending")) continue;

    const stake = Number(coupon.stake);
    // Drop voided legs; grade on the survivors (real-book style).
    const survivors = statuses.filter((s) => s !== "void");
    const hadVoid = survivors.length < statuses.length;

    let outcome: BetStatus;
    let resultPayout: number;

    if (survivors.some((s) => s === "lost")) {
      outcome = "lost";
      resultPayout = 0;
    } else if (survivors.length === 0) {
      // Every leg voided → nothing to grade → refund.
      outcome = "void";
      resultPayout = stake;
    } else if (!hadVoid) {
      // Clean sweep → full win at the multiplier locked in at coupon creation.
      outcome = "won";
      resultPayout = Number(coupon.potential_payout);
    } else {
      // Some voids, all survivors won → re-price on the surviving leg count.
      const row = payouts.byCount[survivors.length];
      const mult = row
        ? coupon.mode === "power"
          ? row.power_payout
          : row.flex_payout
        : null;
      if (mult != null && survivors.length >= 2) {
        outcome = "won";
        resultPayout = Math.round(stake * mult * 100) / 100;
      } else {
        // Dropped below a valid parlay size for this mode → refund.
        outcome = "void";
        resultPayout = stake;
      }
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

  // Refresh the public W/L aggregate that powers /bros profiles. It now spans
  // both sports (one row per user+sport), so refresh after either settles.
  // Cheap + tolerant of an empty matview.
  const { error: refreshErr } = await supabase.rpc("refresh_bro_stats");
  if (refreshErr) {
    // Don't fail settlement on a stats refresh hiccup — log and move on.
    console.warn(`refresh_bro_stats failed: ${refreshErr.message}`);
  }

  return { considered: coupons.length, settled, won, lost, void: voided };
}
