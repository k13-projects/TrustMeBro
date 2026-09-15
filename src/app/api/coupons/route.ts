import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPayoutMap } from "@/lib/analysis/payouts";
import { getRequester } from "@/lib/identity";
import { soccerLegSchema, type SoccerLegInput } from "@/lib/sports/soccer/coupon-legs";
import { consensus, modalLine, SIDES } from "@/lib/analysis/soccer/engine";
import { loadLatestSoccerOdds } from "@/lib/sports/soccer/repo";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A client-quoted price is trusted up to rounding, same tolerance style as
// the multiplier/payout checks below — never trusted beyond it.
const ODDS_TOLERANCE = 0.01;

const BodySchema = z
  .object({
    // Older clients don't send `sport`; default to nba so they keep working.
    sport: z.enum(["nba", "soccer"]).default("nba"),
    mode: z.enum(["power", "flex"]),
    stake: z.number().positive().max(10000),
    payout_multiplier: z.number().positive(),
    potential_payout: z.number().positive(),
    // Legacy shape — every id is an engine prediction. Still how NBA coupons
    // and any not-yet-upgraded soccer client build a request.
    prediction_ids: z.array(z.string().uuid()).min(2).max(6).optional(),
    // Current shape for soccer: a discriminated union of engine references
    // and user-picked rates-board outcomes, freely mixed in one coupon. See
    // src/lib/sports/soccer/coupon-legs.ts for the contract.
    legs: z.array(soccerLegSchema).min(2).max(6).optional(),
  })
  .refine((b) => !!b.legs || !!b.prediction_ids, {
    message: "legs_or_prediction_ids_required",
  });

type EngineLeg = Extract<SoccerLegInput, { kind: "engine" }>;
type UserLeg = Extract<SoccerLegInput, { kind: "user" }>;

type EnginePredictionRow = {
  id: string;
  status: string;
  match_id?: number;
  market?: SoccerMarket;
  side?: MatchSide;
  line?: number | string | null;
  best_odds?: number | string;
};

export async function POST(req: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Read-only handle for prediction/match validation; works for either
  // identity mode because those tables are RLS-public-readable.
  const supabase = await createSupabaseServerClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { sport, mode, stake, payout_multiplier, potential_payout } = parsed.data;

  const legs: SoccerLegInput[] =
    parsed.data.legs ??
    parsed.data.prediction_ids!.map((prediction_id) => ({
      kind: "engine" as const,
      prediction_id,
    }));

  if (sport !== "soccer" && legs.some((l) => l.kind === "user")) {
    return NextResponse.json({ error: "user_legs_soccer_only" }, { status: 400 });
  }

  // Dedup: engine legs by prediction_id, user legs by outcome key (same key
  // shape the client-side cart uses for its own dedupe, per the plan).
  const seen = new Set<string>();
  for (const leg of legs) {
    const key =
      leg.kind === "engine"
        ? `engine:${leg.prediction_id}`
        : `user:${leg.match_id}:${leg.market}:${leg.side}:${leg.line ?? ""}`;
    if (seen.has(key)) {
      return NextResponse.json({ error: "duplicate_picks" }, { status: 400 });
    }
    seen.add(key);
  }

  // Re-verify the multiplier server-side so a malicious client can't claim
  // an inflated payout. We trust the DB, not the request.
  const map = await loadPayoutMap();
  const row = map.byCount[legs.length];
  if (!row) {
    return NextResponse.json({ error: "no_multiplier_for_count" }, { status: 400 });
  }
  const trueMultiplier = mode === "power" ? row.power_payout : row.flex_payout;
  if (trueMultiplier === null || trueMultiplier === undefined) {
    return NextResponse.json(
      { error: mode === "flex" ? "flex_not_supported_for_count" : "no_power_multiplier" },
      { status: 400 },
    );
  }
  if (Math.abs(trueMultiplier - payout_multiplier) > 0.01) {
    return NextResponse.json({ error: "multiplier_mismatch" }, { status: 400 });
  }
  const truePayout = Math.round(stake * trueMultiplier * 100) / 100;
  if (Math.abs(truePayout - potential_payout) > 0.02) {
    return NextResponse.json({ error: "payout_mismatch" }, { status: 400 });
  }

  const engineLegs = legs.filter((l): l is EngineLeg => l.kind === "engine");
  const userLegs = legs.filter((l): l is UserLeg => l.kind === "user");

  // ---- Validate engine legs: real, still pending. Same-game / same-match
  // picks are allowed (same-game parlays), so we only check existence +
  // pending status. For soccer we also pull match_id/market/side/line/
  // best_odds — soccer_coupon_legs now stores its own copy of those columns
  // (migration 0029), so an engine leg needs them at insert time too. ----
  const predTable = sport === "soccer" ? "soccer_predictions" : "predictions";
  const enginePredById = new Map<string, EnginePredictionRow>();
  if (engineLegs.length > 0) {
    const ids = engineLegs.map((l) => l.prediction_id);
    const selectCols =
      sport === "soccer" ? "id, status, match_id, market, side, line, best_odds" : "id, status";
    const { data: preds, error: predsErr } = await supabase
      .from(predTable)
      .select(selectCols)
      .in("id", ids);
    if (predsErr) {
      return NextResponse.json({ error: predsErr.message }, { status: 500 });
    }
    if (!preds || preds.length !== ids.length) {
      return NextResponse.json({ error: "unknown_prediction" }, { status: 400 });
    }
    for (const p of preds as unknown as EnginePredictionRow[]) {
      if (p.status !== "pending") {
        return NextResponse.json({ error: "prediction_already_settled" }, { status: 400 });
      }
      enginePredById.set(p.id, p);
    }
  }

  // ---- Validate + price user legs (soccer only). odds_taken is NEVER
  // trusted as the number to store — it's re-derived here from the same
  // de-vigged consensus the rates board itself displays, and the request is
  // rejected if the client's number doesn't match within rounding. The line
  // for total_goals must be the actual modal line, not whatever the client
  // sent — a forged line is a forged price by another name. ----
  const verifiedUserLegs = new Map<UserLeg, { line: number | null; odds: number }>();
  if (userLegs.length > 0) {
    if (sport !== "soccer") {
      return NextResponse.json({ error: "user_legs_soccer_only" }, { status: 400 });
    }
    const matchIds = Array.from(new Set(userLegs.map((l) => l.match_id)));
    const oddsByMatch = await loadLatestSoccerOdds(matchIds);
    for (const leg of userLegs) {
      const sides = SIDES[leg.market];
      if (!sides.includes(leg.side)) {
        return NextResponse.json({ error: "invalid_side_for_market" }, { status: 400 });
      }
      const quotesForMatch = oddsByMatch.get(leg.match_id) ?? [];
      let marketQuotes = quotesForMatch.filter((q) => q.market === leg.market);
      let trueLine: number | null = null;
      if (leg.market === "total_goals") {
        trueLine = modalLine(marketQuotes);
        if (trueLine === null || leg.line === null || Math.abs(trueLine - leg.line) > 1e-9) {
          return NextResponse.json({ error: "line_mismatch" }, { status: 400 });
        }
        marketQuotes = marketQuotes.filter((q) => q.line === trueLine);
      } else if (leg.line !== null) {
        return NextResponse.json({ error: "line_not_allowed_for_market" }, { status: 400 });
      }
      if (marketQuotes.length === 0) {
        return NextResponse.json({ error: "no_odds_for_leg" }, { status: 400 });
      }
      const { bestOdds, bookCount } = consensus(marketQuotes, sides);
      if (bookCount === 0) {
        return NextResponse.json({ error: "no_odds_for_leg" }, { status: 400 });
      }
      const trueOdds = bestOdds.get(leg.side)?.odds;
      if (trueOdds === undefined) {
        return NextResponse.json({ error: "no_odds_for_leg" }, { status: 400 });
      }
      if (Math.abs(trueOdds - leg.odds_taken) > ODDS_TOLERANCE) {
        return NextResponse.json({ error: "odds_mismatch" }, { status: 400 });
      }
      verifiedUserLegs.set(leg, { line: trueLine, odds: trueOdds });
    }
  }

  // ---- Kickoff enforcement — server-side, both leg sources (soccer only).
  // Verified live: this endpoint previously checked only that a referenced
  // prediction was still 'pending', which stays true until the match is
  // graded well after full time — so adding an engine pick mid-match was
  // silently possible. Closed here since the same code path is already
  // being rewritten. ----
  if (sport === "soccer") {
    const matchIds = Array.from(
      new Set([
        ...[...enginePredById.values()].map((p) => p.match_id as number),
        ...userLegs.map((l) => l.match_id),
      ]),
    );
    if (matchIds.length > 0) {
      const { data: matches, error: matchErr } = await supabase
        .from("soccer_matches")
        .select("id, state")
        .in("id", matchIds);
      if (matchErr) {
        return NextResponse.json({ error: matchErr.message }, { status: 500 });
      }
      const stateById = new Map(
        (matches ?? []).map((m) => [m.id as number, m.state as string]),
      );
      const anyStarted = matchIds.some((id) => stateById.get(id) !== "pre");
      if (anyStarted) {
        return NextResponse.json({ error: "match_already_started" }, { status: 400 });
      }
    }
  }

  // ---- Insert. Always through the service-role client (migration 0032 —
  // authenticated has no INSERT grant left on either table; this route is
  // now the only door). user_id/guest_name come from getRequester(), which
  // resolves the auth case via supabase.auth.getUser() against the real
  // session cookie — never from anything the client puts in the body — so
  // writing as service role doesn't weaken identity, it just removes the
  // RLS-insert grant that made the direct-PostgREST bypass possible. ----
  const writer = supabaseAdmin();
  const identity =
    requester.kind === "auth"
      ? { user_id: requester.user_id, guest_name: null as string | null }
      : { user_id: null as string | null, guest_name: requester.guest_name };

  const { data: coupon, error: cErr } = await writer
    .from("user_coupons")
    .insert({
      ...identity,
      sport,
      mode,
      pick_count: legs.length,
      stake,
      payout_multiplier: trueMultiplier,
      potential_payout: truePayout,
      status: "pending",
    })
    .select("id")
    .single();
  if (cErr || !coupon) {
    return NextResponse.json(
      { error: cErr?.message ?? "coupon_insert_failed" },
      { status: 500 },
    );
  }

  let pErr: { message: string } | null = null;
  if (sport === "soccer") {
    const legRows = legs.map((leg, idx) => {
      if (leg.kind === "engine") {
        const pred = enginePredById.get(leg.prediction_id)!;
        return {
          coupon_id: coupon.id,
          soccer_prediction_id: leg.prediction_id,
          leg_source: "engine" as const,
          match_id: pred.match_id,
          market: pred.market,
          side: pred.side,
          line: pred.line === undefined ? null : pred.line,
          odds_taken: pred.best_odds,
          pick_order: idx,
        };
      }
      const verified = verifiedUserLegs.get(leg)!;
      return {
        coupon_id: coupon.id,
        soccer_prediction_id: null,
        leg_source: "user" as const,
        match_id: leg.match_id,
        market: leg.market,
        side: leg.side,
        line: verified.line,
        odds_taken: verified.odds,
        pick_order: idx,
      };
    });
    const { error } = await writer.from("soccer_coupon_legs").insert(legRows);
    pErr = error;
  } else {
    const legRows = (legs as EngineLeg[]).map((leg, idx) => ({
      coupon_id: coupon.id,
      prediction_id: leg.prediction_id,
      pick_order: idx,
    }));
    const { error } = await writer.from("user_coupon_picks").insert(legRows);
    pErr = error;
  }
  if (pErr) {
    // Best-effort rollback so we don't leave an orphan coupon.
    await writer.from("user_coupons").delete().eq("id", coupon.id);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, coupon_id: coupon.id, potential_payout: truePayout },
    { status: 201 },
  );
}
