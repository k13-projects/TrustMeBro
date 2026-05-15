import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRequester } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  stake: z.number().nonnegative().optional(),
  taken_odds: z.number().positive().optional(),
  user_note: z.string().max(280).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: predictionId } = await params;
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }
  const parsed = BodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Auth path: RLS-bound insert. Guest path: service role + guest_name.
  const writer =
    requester.kind === "auth"
      ? await createSupabaseServerClient()
      : supabaseAdmin();
  const identity =
    requester.kind === "auth"
      ? { user_id: requester.user_id, guest_name: null as string | null }
      : { user_id: null as string | null, guest_name: requester.guest_name };

  const { data, error } = await writer
    .from("user_bets")
    .insert({
      ...identity,
      prediction_id: predictionId,
      ...parsed.data,
      status: "pending" as const,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "already_played" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user_bet_id: data.id }, { status: 201 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: predictionId } = await params;
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const writer =
    requester.kind === "auth"
      ? await createSupabaseServerClient()
      : supabaseAdmin();

  // History integrity: once a bet settles (won/lost/void) the user can't
  // quietly remove it from their record. For authed users RLS keeps them
  // in their own row; for guests we match by guest_name explicitly.
  const ownerCol = requester.kind === "auth" ? "user_id" : "guest_name";
  const ownerVal =
    requester.kind === "auth" ? requester.user_id : requester.guest_name;

  const { data: existing, error: readErr } = await writer
    .from("user_bets")
    .select("status")
    .eq("prediction_id", predictionId)
    .eq(ownerCol, ownerVal)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: true });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ error: "already_settled" }, { status: 409 });
  }

  const { error } = await writer
    .from("user_bets")
    .delete()
    .eq("prediction_id", predictionId)
    .eq("status", "pending")
    .eq(ownerCol, ownerVal);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
