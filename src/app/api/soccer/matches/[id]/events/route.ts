import { NextResponse } from "next/server";
import { soccerProvider } from "@/lib/sports/soccer";

export const runtime = "nodejs";
export const revalidate = 30;

// On-demand match timeline (goals / cards / subs). Fetched only when a user
// expands a game, so the schedule/scores lists stay cheap.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const events = await soccerProvider().getMatchEvents(matchId);
  return NextResponse.json({ events });
}
