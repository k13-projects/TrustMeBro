import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SoccerCompetition } from "@/lib/sports/soccer/competitions";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

type BetStatus = "pending" | "won" | "lost" | "void";

// Decide a single pick against a final score. null ⇒ push/void.
// Exported: this is the leg-agnostic grading core the plan calls out as
// already decoupled from predictions (docs/handoffs/user-coupons-plan_2026-09-14.md
// section 2) — settleSoccerCouponLegs() in src/lib/scoring/settle-coupons.ts
// reuses it verbatim to grade a user-picked coupon leg, which has no
// prediction row to read a status from.
export function outcome(
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

// Grades one competition's pending picks against finished matches and moves
// that competition's ledger (soccer_ledgers) — never another's.
export async function settleSoccer(
  competition: SoccerCompetition,
): Promise<SettleResult> {
  const supabase = supabaseAdmin();

  // Pending predictions whose match has finished.
  const { data: rows, error } = await supabase
    .from("soccer_predictions")
    .select(
      "id, match_id, market, side, line, status, soccer_matches!inner(home_score, away_score, finished)",
    )
    .eq("competition", competition)
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
        .from("soccer_ledgers")
        .select("score")
        .eq("competition", competition)
        .maybeSingle();
      const scoreAfter = Number(scoreRow?.score ?? 0) + delta;
      await supabase
        .from("soccer_ledgers")
        .upsert({ competition, score: scoreAfter, updated_at: now });
      await supabase.from("soccer_system_score_history").insert({
        competition,
        prediction_id: r.id,
        delta,
        outcome: status,
        score_after: scoreAfter,
      });
    }
  }

  // Bump aggregate win/loss/void counts.
  const { data: agg } = await supabase
    .from("soccer_ledgers")
    .select("wins, losses, voids")
    .eq("competition", competition)
    .maybeSingle();
  await supabase.from("soccer_ledgers").upsert({
    competition,
    wins: Number(agg?.wins ?? 0) + wins,
    losses: Number(agg?.losses ?? 0) + losses,
    voids: Number(agg?.voids ?? 0) + voids,
    updated_at: now,
  });

  const couponsSettled = await settleCoupons(competition);

  return {
    predictions_settled: rows.length,
    coupons_settled: couponsSettled,
    score_delta: wins - losses,
  };
}

// A coupon resolves once all its legs are decided: any leg lost → lost;
// all legs won → won; all void → void. Mixed pending → leave pending.
async function settleCoupons(competition: SoccerCompetition): Promise<number> {
  const supabase = supabaseAdmin();
  const { data: coupons, error } = await supabase
    .from("engine_coupons")
    .select("id, engine_coupon_legs(soccer_prediction_id)")
    .eq("sport", "soccer")
    .eq("competition", competition)
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

const STALE_AFTER_MS = 5 * 24 * 3600 * 1000; // 5 days

export type StalenessResult = {
  matches_stale: number;
  predictions_voided: number;
  legs_voided: number;
};

// Safety net for postponed/abandoned matches — a pre-existing gap, not
// introduced by user coupons: this codebase has never parsed ESPN's
// postponed/abandoned statuses, and verified live, soccer_matches.state only
// ever takes 'pre'/'post' today (see
// docs/handoffs/user-coupons-plan_2026-09-14.md section 2). Without this, a
// stuck fixture leaves its predictions AND any coupon legs built on it
// pending forever — worse once users can build coupons on any outcome, since
// a stuck leg now reads as a real (if silent) money commitment instead of an
// abstract engine stat. Anything still `pending` on a match whose kickoff was
// more than 5 days ago and that still hasn't finished gets force-voided —
// both soccer_predictions and soccer_coupon_legs directly, since a stale
// match never reaches `finished = true` and so would never be picked up by
// the normal finished-match settlement paths (settleSoccer above,
// settleSoccerCouponLegs in src/lib/scoring/settle-coupons.ts). This is the
// "smallest honest change" the plan calls for, not full ESPN status parsing
// (distinguishing postponed vs. abandoned vs. delayed) — a match that's
// merely late to get a final posted after 5 days would be wrongly voided;
// accepted risk given how rare that is versus a stuck bet.
export async function voidStaleSoccerRows(): Promise<StalenessResult> {
  const supabase = supabaseAdmin();
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  const { data: staleMatches, error: mErr } = await supabase
    .from("soccer_matches")
    .select("id")
    .eq("finished", false)
    .lt("datetime", staleBefore);
  if (mErr) throw new Error(`load stale matches: ${mErr.message}`);
  if (!staleMatches || staleMatches.length === 0) {
    return { matches_stale: 0, predictions_voided: 0, legs_voided: 0 };
  }
  const matchIds = staleMatches.map((m) => m.id as number);
  const now = new Date().toISOString();

  const { data: pendingPreds } = await supabase
    .from("soccer_predictions")
    .select("id, competition")
    .eq("status", "pending")
    .in("match_id", matchIds);
  const predsToVoid = (pendingPreds ?? []) as Array<{ id: string; competition: string }>;
  if (predsToVoid.length > 0) {
    await supabase
      .from("soccer_predictions")
      .update({ status: "void", settled_side: null, settled_at: now })
      .in(
        "id",
        predsToVoid.map((p) => p.id),
      );

    const byCompetition = new Map<string, number>();
    for (const p of predsToVoid) {
      byCompetition.set(p.competition, (byCompetition.get(p.competition) ?? 0) + 1);
    }
    for (const [competition, count] of byCompetition) {
      const { data: agg } = await supabase
        .from("soccer_ledgers")
        .select("voids")
        .eq("competition", competition)
        .maybeSingle();
      await supabase
        .from("soccer_ledgers")
        .upsert({ competition, voids: Number(agg?.voids ?? 0) + count, updated_at: now });
    }
  }

  const { data: pendingLegs } = await supabase
    .from("soccer_coupon_legs")
    .select("id")
    .eq("status", "pending")
    .in("match_id", matchIds);
  const legsToVoid = (pendingLegs ?? []) as Array<{ id: string }>;
  if (legsToVoid.length > 0) {
    await supabase
      .from("soccer_coupon_legs")
      .update({ status: "void", settled_side: null, settled_at: now })
      .in(
        "id",
        legsToVoid.map((l) => l.id),
      );
  }

  return {
    matches_stale: staleMatches.length,
    predictions_voided: predsToVoid.length,
    legs_voided: legsToVoid.length,
  };
}
