import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequester } from "@/lib/identity";
import { HandleSchema } from "@/lib/bros/handle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  handle: HandleSchema,
  display_name: z.string().trim().min(1).max(48),
  bio: z.string().trim().max(280).optional().nullable(),
  avatar_url: z.string().url().max(512).optional().nullable(),
});

export async function POST(req: Request) {
  const requester = await getRequester();
  if (!requester || requester.kind !== "auth") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

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
  const { handle, display_name, bio, avatar_url } = parsed.data;

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: requester.user_id,
        handle,
        display_name,
        bio: bio ?? null,
        avatar_url: avatar_url ?? null,
      },
      { onConflict: "user_id" },
    )
    .select("user_id, handle, display_name")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "handle_taken" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile: data }, { status: 200 });
}
