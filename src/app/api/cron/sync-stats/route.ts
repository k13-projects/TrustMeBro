import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../_auth";
import { syncDates } from "@/lib/sports/nba/sync";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  upcoming: z.coerce.number().int().min(0).max(14).optional(),
});

const DEFAULT_UPCOMING_DAYS = 5;

export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { date, days, upcoming } = parsed.data;

  // ?date=YYYY-MM-DD pins a date.
  // ?days=N backfills last N days ending yesterday (box scores only).
  // ?upcoming=N overrides how many future days to include.
  // Default: yesterday (finalized stats) + today + next N (schedule rows so
  // the home page and /generate-predictions have games to work with).
  // balldontlie returns scheduled games with empty stats for future dates,
  // and syncDates is no-op-on-empty for the stats upsert.
  const today = todayIsoDate();
  const yesterday = isoDateOffset(today, -1);
  let targetDates: string[];
  if (date && isValidIsoDate(date)) {
    targetDates = [date];
  } else if (days) {
    targetDates = Array.from({ length: days }, (_, i) =>
      isoDateOffset(yesterday, -i),
    ).reverse();
  } else {
    const ahead = upcoming ?? DEFAULT_UPCOMING_DAYS;
    targetDates = [yesterday, today];
    for (let i = 1; i <= ahead; i++) {
      targetDates.push(isoDateOffset(today, i));
    }
  }

  try {
    const result = await syncDates(targetDates);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
