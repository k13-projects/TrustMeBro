import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todayIsoDate } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PrizePicks lines aren't reachable from a stable public API, and the user
// uses PrizePicks as the actual book — so traditional bookmaker odds tracking
// is only useful for relative line shopping. For now: gameday gate + no-op
// when ODDS_API_KEY is unset. Wire The Odds API in when the user provides a
// key; the rest of the pipeline (predictions, settlement, /score) doesn't
// depend on this cron firing.
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const today = todayIsoDate();
  const supabase = supabaseAdmin();
  const { count } = await supabase
    .from("games")
    .select("*", { head: true, count: "exact" })
    .eq("date", today);
  if (!count) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no games today",
    });
  }

  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "ODDS_API_KEY not configured",
      note: "PrizePicks lines aren't pulled here; this cron tracks traditional sportsbook odds for value comparison.",
    });
  }

  // TODO when ODDS_API_KEY is set: fetch from the-odds-api.com player props,
  // normalize per (game_id, player_id, market, line, side, bookmaker, odds),
  // upsert into odds_snapshots, and compute expected_value on predictions
  // from confidence × max(odds).
  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: "implementation pending",
  });
}
