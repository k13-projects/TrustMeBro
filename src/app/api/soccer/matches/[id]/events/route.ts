import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { soccerProvider } from "@/lib/sports/soccer";
import {
  DEFAULT_COMPETITION,
  isCompetition,
} from "@/lib/sports/soccer/competitions";

export const runtime = "nodejs";
export const revalidate = 30;

// On-demand match timeline (goals / cards). Fetched only when a user expands a
// game, so the schedule/scores lists stay cheap. The match row tells us which
// ESPN feed it came from (qualifying ties live under a different slug), so the
// summary call hits the right league.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const { data } = await supabaseAdmin()
    .from("soccer_matches")
    .select("competition, league_slug")
    .eq("id", matchId)
    .maybeSingle();
  const competition = isCompetition(data?.competition)
    ? data.competition
    : DEFAULT_COMPETITION;
  const provider = soccerProvider(competition, data?.league_slug ?? undefined);
  const events = await provider.getMatchEvents(matchId);
  return NextResponse.json({ events });
}
