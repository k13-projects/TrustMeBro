import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRequester } from "@/lib/identity";
import { getFollowedTeamIds } from "@/lib/sports/soccer/follow-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ team_id: z.number().int().positive() });

export async function GET() {
  return NextResponse.json({ ok: true, team_ids: await getFollowedTeamIds() });
}

export async function POST(req: Request) {
  const requester = await getRequester();
  if (!requester) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { team_id } = parsed.data;

  const admin = supabaseAdmin();
  const { data: team } = await admin
    .from("soccer_teams")
    .select("id")
    .eq("id", team_id)
    .maybeSingle();
  if (!team) return NextResponse.json({ error: "unknown_team" }, { status: 404 });

  const writer = requester.kind === "auth" ? await createSupabaseServerClient() : admin;
  const row: {
    team_id: number;
    user_id: string | null;
    guest_name: string | null;
  } =
    requester.kind === "auth"
      ? { team_id, user_id: requester.user_id, guest_name: null }
      : { team_id, user_id: null, guest_name: requester.guest_name };

  // The uniqueness guards are partial indexes (one per identity kind), which
  // Postgres will not use for ON CONFLICT, so check first and treat a
  // duplicate as success — following twice is the same as following once.
  let existing = writer.from("soccer_team_follows").select("id").eq("team_id", team_id);
  existing =
    requester.kind === "auth"
      ? existing.eq("user_id", requester.user_id)
      : existing.eq("guest_name", requester.guest_name);
  const { data: already } = await existing.maybeSingle();
  if (!already) {
    const { error } = await writer.from("soccer_team_follows").insert(row);
    // 23505 = unique violation: someone followed in a parallel request.
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, following: true, team_id });
}

export async function DELETE(req: Request) {
  const requester = await getRequester();
  if (!requester) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const writer =
    requester.kind === "auth" ? await createSupabaseServerClient() : supabaseAdmin();
  let q = writer.from("soccer_team_follows").delete().eq("team_id", parsed.data.team_id);
  q =
    requester.kind === "auth"
      ? q.eq("user_id", requester.user_id)
      : q.eq("guest_name", requester.guest_name);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, following: false, team_id: parsed.data.team_id });
}
