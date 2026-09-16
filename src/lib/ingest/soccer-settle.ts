import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SoccerCompetition } from "@/lib/sports/soccer/competitions";
import { refreshStaleMatches } from "@/lib/sports/soccer/live";
import {
  settleSoccer,
  voidStaleSoccerRows,
  type SettleResult,
  type StalenessResult,
} from "@/lib/analysis/soccer/settle";
import { gradeScoreCalls } from "@/lib/analysis/soccer/grade-calls";
import {
  settleSoccerCoupons,
  settleSoccerCouponLegs,
  type SettleCouponsResult,
  type SettleSoccerCouponLegsResult,
} from "@/lib/scoring/settle-coupons";

export type CompetitionSettleResult = SettleResult & { calls_graded: number };

export type SoccerSettlementFinish = {
  staleness: StalenessResult;
  coupon_legs_settled: SettleSoccerCouponLegsResult;
  user_coupons: SettleCouponsResult;
};

/** Grades one competition's pending predictions + bro score calls. */
export async function settleOneCompetition(
  competition: SoccerCompetition,
): Promise<CompetitionSettleResult> {
  const settled = await settleSoccer(competition);
  const calls_graded = await gradeScoreCalls(competition);
  return { ...settled, calls_graded };
}

/**
 * The three competition-agnostic steps every settlement pass ends with:
 * force-void anything stuck (voidStaleSoccerRows), propagate prediction
 * status onto coupon legs (settleSoccerCouponLegs), then grade user coupons
 * off that leg status (settleSoccerCoupons — also refreshes bro_stats).
 * Order matters: legs read predictions that settleOneCompetition must have
 * already graded, and coupons read leg status the legs step just wrote.
 *
 * Extracted so the settle-bets cron and the on-visit settlement below run
 * the exact same sequence and can never drift apart.
 */
export async function finishSoccerSettlement(): Promise<SoccerSettlementFinish> {
  const staleness = await voidStaleSoccerRows();
  const coupon_legs_settled = await settleSoccerCouponLegs();
  const user_coupons = await settleSoccerCoupons();
  return { staleness, coupon_legs_settled, user_coupons };
}

/**
 * Cheap existence check: does this competition have a pending engine pick, or
 * a pending user-built coupon leg, whose match has already finished? Mirrors
 * settleSoccer's own query (soccer_predictions × soccer_matches!inner) for
 * the engine side so "is there work" and "do the work" never disagree about
 * what counts.
 *
 * The coupon-leg check closes a real gap: a match that finishes with only a
 * user-built leg pending (no engine prediction row involved) previously had
 * no representation here, so settleOnVisit skipped it and it waited for the
 * once-daily settle-bets cron. Both checks run concurrently — this stays one
 * additional bounded query (soccer_coupon_legs_pending_idx makes it cheap),
 * and neither branch writes anything.
 */
export async function hasSettleWork(competition: SoccerCompetition): Promise<boolean> {
  const supabase = supabaseAdmin();
  const [predictionWork, legWork] = await Promise.all([
    supabase
      .from("soccer_predictions")
      .select("id, soccer_matches!inner(finished)")
      .eq("competition", competition)
      .eq("status", "pending")
      .eq("soccer_matches.finished", true)
      .limit(1),
    supabase
      .from("soccer_coupon_legs")
      .select("id, soccer_matches!inner(finished, competition)")
      .eq("status", "pending")
      .eq("soccer_matches.finished", true)
      .eq("soccer_matches.competition", competition)
      .limit(1),
  ]);
  if (predictionWork.error) {
    throw new Error(`check pending finished predictions: ${predictionWork.error.message}`);
  }
  if (legWork.error) {
    throw new Error(`check pending finished coupon legs: ${legWork.error.message}`);
  }
  return (predictionWork.data?.length ?? 0) > 0 || (legWork.data?.length ?? 0) > 0;
}

export type VisitSettleResult =
  | { ran: false; refreshed: number }
  | ({ ran: true; refreshed: number } & CompetitionSettleResult & SoccerSettlementFinish);

/**
 * On-visit settlement for the one competition someone is currently looking
 * at, meant to be called from `after()` behind `maybeRefresh` so it's
 * throttled and single-flight. Picks currently only grade at the daily
 * 11:30 UTC settle-bets cron (Hobby plan caps crons at once/day) — this
 * closes the gap for the common case of a match finishing mid-day and
 * someone actually being on the page.
 *
 * syncCompetition (full fixture sync) is deliberately NOT run here — the
 * football page already keeps fixtures fresh via its own maybeRefresh
 * (refreshFixturesWindow). refreshStaleMatches still runs first, though: it's
 * what catches a match ESPN now shows finished that our own row doesn't yet,
 * which the pending-work gate below depends on being current, and it's
 * bounded/cheap on its own (a single filtered query, only reaching ESPN for
 * rows it actually finds stale).
 *
 * Skips with zero writes when there's nothing to grade, so a normal visit
 * (nothing pending has finished) costs one query plus refreshStaleMatches's
 * own bounded query.
 */
export async function settleOnVisit(
  competition: SoccerCompetition,
): Promise<VisitSettleResult> {
  const refreshed = await refreshStaleMatches(competition);
  if (!(await hasSettleWork(competition))) {
    return { ran: false, refreshed };
  }
  const settled = await settleOneCompetition(competition);
  const finishing = await finishSoccerSettlement();
  return { ran: true, refreshed, ...settled, ...finishing };
}
