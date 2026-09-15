import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../../_auth";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import { generateSoccerPredictions } from "@/lib/analysis/soccer/run";
import {
  COMPETITIONS,
  isCompetition,
  liveCompetitions,
  type SoccerCompetition,
} from "@/lib/sports/soccer/competitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  competition: z.string().optional(),
  date: z.string().optional(),
  ahead: z.coerce.number().int().min(0).max(14).optional(),
});

// Runs the soccer engine over each LIVE competition's matches with odds in the
// date window, writing fresh predictions + BANKO flags + engine coupons
// (2×/3×/5×/10× + surprise). Depends on track-odds having populated
// soccer_odds_snapshots first.
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
    // Match the odds window so a matchday's picks exist as soon as it's priced.
    const ahead = parsed.data.ahead ?? 8;
    dates = [today];
    for (let i = 1; i <= ahead; i++) dates.push(isoDateOffset(today, i));
  }

  let competitions: SoccerCompetition[];
  if (parsed.data.competition) {
    if (!isCompetition(parsed.data.competition)) {
      return NextResponse.json({ error: "unknown competition" }, { status: 400 });
    }
    competitions = [parsed.data.competition];
  } else {
    competitions = liveCompetitions();
  }

  const results: Record<string, unknown> = {};
  for (const competition of competitions) {
    if (COMPETITIONS[competition].oddsKey === null) {
      results[competition] = { skipped: "no odds source for this competition yet (oddsKey null)" };
      continue;
    }
    results[competition] = await generateSoccerPredictions(competition, dates);
  }
  return NextResponse.json({ ok: true, dates, competitions: results });
}
