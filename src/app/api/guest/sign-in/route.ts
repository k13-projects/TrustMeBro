import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  GUEST_COOKIE,
  GUEST_COOKIE_MAX_AGE,
  guestKey,
  normalizeGuestName,
} from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  name: z.string().min(1).max(48),
});

export async function POST(req: Request) {
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
  const name = normalizeGuestName(parsed.data.name);
  if (!name) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  // Upsert the discovery row so /login can list recent names. RLS is
  // bypassed here (service role); the table itself is public-readable.
  const supabase = supabaseAdmin();
  await supabase
    .from("guest_profiles")
    .upsert(
      {
        name_lower: guestKey(name),
        display_name: name,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "name_lower" },
    );

  const store = await cookies();
  store.set(GUEST_COOKIE, name, {
    maxAge: GUEST_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return NextResponse.json({ ok: true, display_name: name });
}
