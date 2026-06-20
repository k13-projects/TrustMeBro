import { NextResponse } from "next/server";
import { fetchLiveScores } from "@/lib/sports/soccer/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Current scores for today's matches, straight from ESPN. Polled by the
// <LiveMatch> client while a match is live. Public (read-only scoreboard) — no
// auth. On error we still return 200 with an empty list so the poller keeps the
// last-known SSR values instead of flashing an error.
export async function GET() {
  try {
    const matches = await fetchLiveScores();
    return NextResponse.json(
      { ok: true, matches },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json({
      ok: false,
      matches: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
