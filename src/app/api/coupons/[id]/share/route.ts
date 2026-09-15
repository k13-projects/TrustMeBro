import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequester } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error: error.message };
  return { has: !!data };
}

// Both directions go through the set_coupon_public() RPC (migration 0031) —
// user_coupons has no client UPDATE grant any more, and unsharing a coupon
// that already settled is rejected inside the RPC itself (F-2's guard), not
// re-checked here.
async function setPublic(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  couponId: string,
  makePublic: boolean,
) {
  const { data, error } = await supabase.rpc("set_coupon_public", {
    p_coupon_id: couponId,
    p_public: makePublic,
  });
  if (error) {
    if (error.message.includes("cannot_unshare_settled_coupon")) {
      return { status: 409 as const, body: { error: "cannot_unshare_settled_coupon" } };
    }
    return { status: 500 as const, body: { error: error.message } };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { status: 404 as const, body: { error: "not_found" } };
  }
  return { status: 200 as const, body: { ok: true, coupon: row } };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: couponId } = await params;
  const requester = await getRequester();
  if (!requester || requester.kind !== "auth") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const profile = await ensureProfile(supabase, requester.user_id);
  if ("error" in profile) {
    return NextResponse.json({ error: profile.error }, { status: 500 });
  }
  if (!profile.has) {
    return NextResponse.json({ error: "profile_required" }, { status: 409 });
  }

  const result = await setPublic(supabase, couponId, true);
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: couponId } = await params;
  const requester = await getRequester();
  if (!requester || requester.kind !== "auth") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const result = await setPublic(supabase, couponId, false);
  return NextResponse.json(result.body, { status: result.status });
}
