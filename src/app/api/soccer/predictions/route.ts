import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRequester } from "@/lib/identity";
import { hasKickedOff } from "@/lib/date";
import {
  getOwnScoreCalls,
  getPublicCallSummary,
} from "@/lib/sports/soccer/predictions-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = "id, match_id, competition, home_goals, away_goals, points, graded_at";

const PostBody = z.object({
  match_id: z.number().int().positive(),
  home_goals: z.number().int().min(0).max(20),
  away_goals: z.number().int().min(0).max(20),
});

const MatchIdBody = z.object({
  match_id: z.number().int().positive(),
});

// The requester's own calls for a set of matches, plus (for matches that have
// already kicked off) the public distribution across signed-in bros. Empty
// `own` when signed out — this is a read, not a gate.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("match_ids") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const parsed = z.array(z.number().int().positive()).max(100).safeParse(ids);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_match_ids" }, { status: 400 });
  }
  const matchIds = parsed.data;
  if (matchIds.length === 0) {
    return NextResponse.json({ ok: true, calls: [] });
  }

  const [own, pub] = await Promise.all([
    getOwnScoreCalls(matchIds),
    getPublicCallSummary(matchIds),
  ]);
  const calls = matchIds.map((id) => ({
    match_id: id,
    own: own.get(id) ?? null,
    public: pub.get(id) ?? null,
  }));
  return NextResponse.json(
    { ok: true, calls },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Upsert on (match_id, user_id) / (match_id, guest_name). We do it as an
// explicit update-then-insert rather than `.upsert()` because the table's
// uniqueness lives on two *partial* indexes (one per identity kind, see
// migration 0024) — a plain `ON CONFLICT (match_id, user_id)` can't infer
// against a partial index without repeating its predicate, which the
// supabase-js upsert helper has no way to express.
export async function POST(req: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { match_id, home_goals, away_goals } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: match, error: matchErr } = await supabase
    .from("soccer_matches")
    .select("id, competition, datetime")
    .eq("id", match_id)
    .maybeSingle();
  if (matchErr) {
    return NextResponse.json({ error: matchErr.message }, { status: 500 });
  }
  if (!match) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (match.datetime && hasKickedOff(match.datetime)) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }

  const writer = requester.kind === "auth" ? supabase : supabaseAdmin();
  const identityCol = requester.kind === "auth" ? "user_id" : "guest_name";
  const identityVal =
    requester.kind === "auth" ? requester.user_id : requester.guest_name;

  const { data: updated, error: updateErr } = await writer
    .from("soccer_score_predictions")
    .update({ home_goals, away_goals })
    .eq("match_id", match_id)
    .eq(identityCol, identityVal)
    .select(SELECT)
    .maybeSingle();
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (updated) {
    return NextResponse.json({ ok: true, call: updated });
  }

  const insertPayload = {
    match_id,
    competition: match.competition,
    home_goals,
    away_goals,
    user_id: requester.kind === "auth" ? requester.user_id : null,
    guest_name: requester.kind === "auth" ? null : requester.guest_name,
  };

  const { data: inserted, error: insertErr } = await writer
    .from("soccer_score_predictions")
    .insert(insertPayload)
    .select(SELECT)
    .single();
  if (insertErr) {
    if (insertErr.code === "23505") {
      // Raced with another insert for the same identity between the update
      // and insert above — the row exists now, so update it instead.
      const { data: retried, error: retryErr } = await writer
        .from("soccer_score_predictions")
        .update({ home_goals, away_goals })
        .eq("match_id", match_id)
        .eq(identityCol, identityVal)
        .select(SELECT)
        .maybeSingle();
      if (retryErr) {
        return NextResponse.json({ error: retryErr.message }, { status: 500 });
      }
      if (retried) {
        return NextResponse.json({ ok: true, call: retried });
      }
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, call: inserted }, { status: 201 });
}

export async function DELETE(req: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = MatchIdBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { match_id } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: match, error: matchErr } = await supabase
    .from("soccer_matches")
    .select("id, datetime")
    .eq("id", match_id)
    .maybeSingle();
  if (matchErr) {
    return NextResponse.json({ error: matchErr.message }, { status: 500 });
  }
  if (!match) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (match.datetime && hasKickedOff(match.datetime)) {
    return NextResponse.json({ error: "locked" }, { status: 409 });
  }

  const writer = requester.kind === "auth" ? supabase : supabaseAdmin();
  const identityCol = requester.kind === "auth" ? "user_id" : "guest_name";
  const identityVal =
    requester.kind === "auth" ? requester.user_id : requester.guest_name;

  const { error } = await writer
    .from("soccer_score_predictions")
    .delete()
    .eq("match_id", match_id)
    .eq(identityCol, identityVal);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
