import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequester } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  followee_id: z.string().uuid(),
});

async function parseFollowee(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: "invalid_json" as const };
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, issues: parsed.error.issues };
  }
  return { value: parsed.data };
}

export async function POST(req: Request) {
  const requester = await getRequester();
  if (!requester || requester.kind !== "auth") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const result = await parseFollowee(req);
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }
  const { followee_id } = result.value;
  if (followee_id === requester.user_id) {
    return NextResponse.json({ error: "cant_follow_self" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("follows")
    .insert({ follower_id: requester.user_id, followee_id });

  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, following: true });
}

export async function DELETE(req: Request) {
  const requester = await getRequester();
  if (!requester || requester.kind !== "auth") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const result = await parseFollowee(req);
  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }
  const { followee_id } = result.value;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", requester.user_id)
    .eq("followee_id", followee_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, following: false });
}
