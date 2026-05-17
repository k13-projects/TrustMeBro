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

  const { data, error } = await supabase
    .from("user_coupons")
    .update({ is_public: true, shared_at: new Date().toISOString() })
    .eq("id", couponId)
    .eq("user_id", requester.user_id)
    .select("id, is_public, shared_at")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, coupon: data });
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
  const { data, error } = await supabase
    .from("user_coupons")
    .update({ is_public: false, shared_at: null })
    .eq("id", couponId)
    .eq("user_id", requester.user_id)
    .select("id, is_public")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, coupon: data });
}
