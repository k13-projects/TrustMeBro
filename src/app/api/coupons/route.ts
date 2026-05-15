import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPayoutMap } from "@/lib/analysis/payouts";
import { getRequester } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  mode: z.enum(["power", "flex"]),
  stake: z.number().positive().max(10000),
  prediction_ids: z.array(z.string().uuid()).min(2).max(6),
  payout_multiplier: z.number().positive(),
  potential_payout: z.number().positive(),
});

export async function POST(req: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Read-only handle for prediction validation; works for either identity
  // mode because predictions are RLS-public-readable.
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
  const { mode, stake, prediction_ids, payout_multiplier, potential_payout } =
    parsed.data;
  const uniqueIds = Array.from(new Set(prediction_ids));
  if (uniqueIds.length !== prediction_ids.length) {
    return NextResponse.json({ error: "duplicate_picks" }, { status: 400 });
  }

  // Re-verify the multiplier server-side so a malicious client can't claim
  // an inflated payout. We trust the DB, not the request.
  const map = await loadPayoutMap();
  const row = map.byCount[uniqueIds.length];
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

  // Validate the picks: they must be real, pending, and come from distinct
  // games — same rule as the cart UI enforces.
  const { data: preds, error: predsErr } = await supabase
    .from("predictions")
    .select("id, game_id, status")
    .in("id", uniqueIds);
  if (predsErr) {
    return NextResponse.json({ error: predsErr.message }, { status: 500 });
  }
  if (!preds || preds.length !== uniqueIds.length) {
    return NextResponse.json({ error: "unknown_prediction" }, { status: 400 });
  }
  if (preds.some((p) => p.status !== "pending")) {
    return NextResponse.json({ error: "prediction_already_settled" }, { status: 400 });
  }
  const gameIds = new Set(preds.map((p) => p.game_id));
  if (gameIds.size !== preds.length) {
    return NextResponse.json({ error: "same_game_picks" }, { status: 400 });
  }

  // Guests don't have a Supabase session, so RLS would reject any insert
  // gated on auth.uid(). Service role bypasses RLS; the identity in the
  // cookie becomes the partition key via guest_name.
  const writer = requester.kind === "auth" ? supabase : supabaseAdmin();
  const identity =
    requester.kind === "auth"
      ? { user_id: requester.user_id, guest_name: null as string | null }
      : { user_id: null as string | null, guest_name: requester.guest_name };

  const { data: coupon, error: cErr } = await writer
    .from("user_coupons")
    .insert({
      ...identity,
      mode,
      pick_count: uniqueIds.length,
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

  const pickRows = uniqueIds.map((prediction_id, idx) => ({
    coupon_id: coupon.id,
    prediction_id,
    pick_order: idx,
  }));
  const { error: pErr } = await writer
    .from("user_coupon_picks")
    .insert(pickRows);
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
