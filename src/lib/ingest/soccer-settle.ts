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
 * Cheap existence check: does this competition have a pending engine pick
 * whose match has already finished? Mirrors settleSoccer's own query
 * (soccer_predictions × soccer_matches!inner) so "is there work" and "do the
 * work" never disagree about what counts.
 */
export async function hasSettleWork(competition: SoccerCompetition): Promise<boolean> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("soccer_predictions")
    .select("id, soccer_matches!inner(finished)")
    .eq("competition", competition)
    .eq("status", "pending")
    .eq("soccer_matches.finished", true)
    .limit(1);
  if (error) throw new Error(`check pending finished predictions: ${error.message}`);
  return (data?.length ?? 0) > 0;
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
