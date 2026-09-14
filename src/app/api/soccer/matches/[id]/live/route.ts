import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { soccerProvider } from "@/lib/sports/soccer";
import {
  DEFAULT_COMPETITION,
  isCompetition,
} from "@/lib/sports/soccer/competitions";
import { buildLiveSnapshot } from "@/lib/sports/soccer/match-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Polled by <LiveTracker> every 20s while a match is live (or near kickoff).
// Same lookup as the events route (the match row tells us which ESPN feed it
// came from), plus the shared win-probability snapshot. Always 200 — a failed
// upstream call returns ok:false with no payload so the poller just keeps
// showing the last-known snapshot instead of erroring out.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json(
      { ok: false, error: "bad id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { data } = await supabaseAdmin()
      .from("soccer_matches")
      .select("competition, league_slug")
      .eq("id", matchId)
      .maybeSingle();
    const competition = isCompetition(data?.competition)
      ? data.competition
      : DEFAULT_COMPETITION;
    const provider = soccerProvider(competition, data?.league_slug ?? undefined);

    const [detail, events] = await Promise.all([
      provider.getMatchDetail(matchId),
      provider.getMatchEvents(matchId),
    ]);
    if (!detail) {
      return NextResponse.json(
        { ok: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const snapshot = await buildLiveSnapshot(matchId, detail, events);
    return NextResponse.json(
      { ok: true, ...snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
