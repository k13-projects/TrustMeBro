import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPayoutMap } from "@/lib/analysis/payouts";
import { outcome } from "@/lib/analysis/soccer/settle";
import type { BetStatus } from "@/lib/analysis/types";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

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
};

type NbaCouponPickRow = {
  coupon_id: string;
  prediction: { status: BetStatus } | { status: BetStatus }[] | null;
};

type SoccerCouponLegRow = {
  coupon_id: string;
  status: BetStatus;
};

/**
 * Settle saved user_coupons whose linked predictions are now all final.
 *
 * Rules (real-book style — a voided leg is DROPPED and the parlay re-prices
 * on the legs that actually graded, like a sportsbook):
 *  - Any surviving (non-void) leg 'lost' → coupon 'lost', pays 0.
 *  - All legs void → coupon 'void', refund the stake.
 *  - All survivors 'won' → pay stake × the current multiplier for the
 *    actual surviving leg count (e.g. a 4-pick with 1 void pays at the
 *    3-pick rate; a clean 2-pick sweep pays at the 2-pick rate). This is
 *    ALWAYS derived fresh from payout_multipliers, never from the coupon's
 *    own stored potential_payout/pick_count — those are declared at
 *    creation and, per docs/handoffs/user-coupons-security_2026-09-15.md
 *    (F-1-R), must never be trusted as a description of how many legs
 *    actually ended up attached or what they're really worth. If there's
 *    no valid multiplier for that count/mode (e.g. 2-pick → 1 survivor
 *    after a void) → refund the stake.
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
    .select("id, mode, stake")
    .eq("status", "pending")
    .eq("sport", sport);
  if (cErr) throw new Error(`load pending coupons: ${cErr.message}`);
  const coupons = (pendingCoupons ?? []) as CouponRow[];
  if (coupons.length === 0) {
    return { considered: 0, settled: 0, won: 0, lost: 0, void: 0 };
  }

  const couponIds = coupons.map((c) => c.id);
  const picksByCoupon = new Map<string, BetStatus[]>();

  if (sport === "soccer") {
    // THE LANDMINE (docs/handoffs/user-coupons-plan_2026-09-14.md section 2):
    // this used to join through soccer_prediction_id into
    // soccer_predictions.status. A user-picked leg (migration 0029) has no
    // prediction row, so that join silently dropped it — a coupon with a
    // pending user leg would look like it had fewer legs than it does and
    // could settle prematurely. soccer_coupon_legs.status is now the leg's
    // own source of truth for both engine and user legs (kept current by
    // settleSoccerCouponLegs below), so read it directly — no join at all.
    const { data: legRows, error: lErr } = await supabase
      .from("soccer_coupon_legs")
      .select("coupon_id, status")
      .in("coupon_id", couponIds);
    if (lErr) throw new Error(`load soccer coupon legs: ${lErr.message}`);
    for (const raw of (legRows ?? []) as SoccerCouponLegRow[]) {
      const list = picksByCoupon.get(raw.coupon_id) ?? [];
      list.push(raw.status);
      picksByCoupon.set(raw.coupon_id, list);
    }
  } else {
    const { data: pickRows, error: pErr } = await supabase
      .from("user_coupon_picks")
      .select("coupon_id, prediction:predictions(status)")
      .in("coupon_id", couponIds);
    if (pErr) throw new Error(`load coupon picks: ${pErr.message}`);
    for (const raw of (pickRows ?? []) as NbaCouponPickRow[]) {
      const pred = Array.isArray(raw.prediction) ? (raw.prediction[0] ?? null) : raw.prediction;
      if (!pred) continue;
      const list = picksByCoupon.get(raw.coupon_id) ?? [];
      list.push(pred.status);
      picksByCoupon.set(raw.coupon_id, list);
    }
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

    let outcome: BetStatus;
    let resultPayout: number;

    if (survivors.some((s) => s === "lost")) {
      outcome = "lost";
      resultPayout = 0;
    } else if (survivors.length === 0) {
      // Every leg voided → nothing to grade → refund.
      outcome = "void";
      resultPayout = stake;
    } else {
      // All survivors won (no lost, none pending — checked above). Never
      // trust the stored potential_payout/pick_count here, clean sweep or
      // not (docs/handoffs/user-coupons-security_2026-09-15.md, F-1-R
      // "compounding" findings — a coupon could reach here with fewer real
      // legs than its declared pick_count implied). Always re-derive the
      // payout from the actual number of legs found in the table, the same
      // way the void-repricing path below already had to. hadVoid no
      // longer changes the branch — it only ever affected which count we
      // priced against, and survivors.length is already that count either
      // way.
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
        // Not a valid parlay size for this mode (either it dropped below 2
        // after voids, or it never had a real multiplier for its count in
        // the first place) → refund rather than pay an unpriced bet.
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

export type SettleSoccerCouponLegsResult = {
  legs_considered: number;
  legs_settled: number;
  engine_legs_settled: number;
  user_legs_settled: number;
};

type PendingLegRow = {
  id: string;
  leg_source: "engine" | "user";
  soccer_prediction_id: string | null;
  market: SoccerMarket;
  side: MatchSide;
  line: number | string | null;
  soccer_matches: { home_score: number; away_score: number } | { home_score: number; away_score: number }[] | null;
};

type PredictionStatusRow = {
  id: string;
  status: BetStatus;
  settled_side: MatchSide | null;
  settled_at: string | null;
};

/**
 * Write soccer_coupon_legs.status directly for both leg sources, per the
 * plan's "grading path" (section 2). Must run after settleSoccer() has
 * graded soccer_predictions for the newly-finished matches, and before
 * settleSoccerCoupons() reads leg status to grade the parent coupon.
 *
 *  - Engine legs: copy status/settled_side/settled_at from the already-graded
 *    soccer_predictions row — settleSoccer() computed it correctly, this just
 *    propagates it onto the leg instead of recomputing.
 *  - User legs: no prediction to copy from, so grade directly against the
 *    match's final score with the same pure outcome() function settleSoccer()
 *    uses internally (handles match_winner, total_goals incl. the
 *    lands-exactly-on-the-line push/void case, and btts identically for
 *    either leg source).
 */
export async function settleSoccerCouponLegs(): Promise<SettleSoccerCouponLegsResult> {
  const supabase = supabaseAdmin();

  const { data: rows, error } = await supabase
    .from("soccer_coupon_legs")
    .select(
      "id, leg_source, soccer_prediction_id, market, side, line, soccer_matches!inner(home_score, away_score, finished)",
    )
    .eq("status", "pending")
    .eq("soccer_matches.finished", true);
  if (error) throw new Error(`load pending coupon legs: ${error.message}`);
  const legs = (rows ?? []) as unknown as PendingLegRow[];
  if (legs.length === 0) {
    return { legs_considered: 0, legs_settled: 0, engine_legs_settled: 0, user_legs_settled: 0 };
  }

  const engineIds = legs
    .filter((l) => l.leg_source === "engine" && l.soccer_prediction_id)
    .map((l) => l.soccer_prediction_id as string);
  const predById = new Map<string, PredictionStatusRow>();
  if (engineIds.length > 0) {
    const { data: preds, error: predErr } = await supabase
      .from("soccer_predictions")
      .select("id, status, settled_side, settled_at")
      .in("id", engineIds);
    if (predErr) throw new Error(`load linked predictions: ${predErr.message}`);
    for (const p of (preds ?? []) as PredictionStatusRow[]) predById.set(p.id, p);
  }

  const now = new Date().toISOString();
  let engineSettled = 0;
  let userSettled = 0;

  for (const leg of legs) {
    if (leg.leg_source === "engine") {
      const pred = leg.soccer_prediction_id ? predById.get(leg.soccer_prediction_id) : undefined;
      // Not settled yet on the prediction side (shouldn't happen once its
      // match is finished, but don't propagate a status we don't have).
      if (!pred || pred.status === "pending") continue;
      const { error: updErr } = await supabase
        .from("soccer_coupon_legs")
        .update({
          status: pred.status,
          settled_side: pred.settled_side,
          settled_at: pred.settled_at ?? now,
        })
        .eq("id", leg.id);
      if (updErr) throw new Error(`update engine leg ${leg.id}: ${updErr.message}`);
      engineSettled++;
    } else {
      const match = Array.isArray(leg.soccer_matches) ? leg.soccer_matches[0] : leg.soccer_matches;
      if (!match) continue;
      const { status, result } = outcome(
        leg.market,
        leg.side,
        leg.line === null ? null : Number(leg.line),
        match.home_score,
        match.away_score,
      );
      const { error: updErr } = await supabase
        .from("soccer_coupon_legs")
        .update({ status, settled_side: result, settled_at: now })
        .eq("id", leg.id);
      if (updErr) throw new Error(`update user leg ${leg.id}: ${updErr.message}`);
      userSettled++;
    }
  }

  return {
    legs_considered: legs.length,
    legs_settled: engineSettled + userSettled,
    engine_legs_settled: engineSettled,
    user_legs_settled: userSettled,
  };
}
