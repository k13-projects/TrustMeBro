import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../../_auth";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import { soccerProvider } from "@/lib/sports/soccer";
import { insertStandings, upsertMatches } from "@/lib/sports/soccer/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().optional(),
  ahead: z.coerce.number().int().min(0).max(10).optional(),
  back: z.coerce.number().int().min(0).max(3).optional(),
});

// Pulls World Cup fixtures + scores for a date window (default: yesterday →
// +3 days, so finished games settle and upcoming games are ready for odds)
// and a full standings snapshot. ESPN soccer API is free — no credit cost.
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const today = todayIsoDate();
  let dates: string[];
  if (parsed.data.date && isValidIsoDate(parsed.data.date)) {
    dates = [parsed.data.date];
  } else {
    const back = parsed.data.back ?? 1;
    const ahead = parsed.data.ahead ?? 3;
    dates = [];
    for (let i = -back; i <= ahead; i++) dates.push(isoDateOffset(today, i));
  }

  const provider = soccerProvider();
  const matches = await provider.listMatches({ dates });
  await upsertMatches(matches);

  let standingsCount = 0;
  try {
    const standings = await provider.listStandings(Number(today.slice(0, 4)));
    await insertStandings(standings);
    standingsCount = standings.length;
  } catch {
    // Standings can be unavailable pre-tournament; fixtures still sync.
  }

  return NextResponse.json({
    ok: true,
    dates,
    matches_synced: matches.length,
    standings_synced: standingsCount,
  });
}
