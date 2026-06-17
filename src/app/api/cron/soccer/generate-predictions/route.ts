import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../../_auth";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import { generateSoccerPredictions } from "@/lib/analysis/soccer/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().optional(),
  ahead: z.coerce.number().int().min(0).max(7).optional(),
});

// Runs the soccer engine over matches with odds in the date window, writing
// fresh predictions + BANKO flags + engine coupons (2×/3×/5×/10× + surprise).
// Depends on track-odds having populated soccer_odds_snapshots first.
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
    const ahead = parsed.data.ahead ?? 1;
    dates = [today];
    for (let i = 1; i <= ahead; i++) dates.push(isoDateOffset(today, i));
  }

  const result = await generateSoccerPredictions(dates);
  return NextResponse.json({ ok: true, dates, ...result });
}
