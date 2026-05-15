import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../_auth";
import { syncDates } from "@/lib/sports/nba/sync";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
});

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
  const { date, days } = parsed.data;

  // Default: yesterday. ?date=YYYY-MM-DD pins a date.
  // ?days=N backfills last N days ending yesterday.
  const yesterday = isoDateOffset(todayIsoDate(), -1);
  let targetDates: string[];
  if (date && isValidIsoDate(date)) {
    targetDates = [date];
  } else if (days) {
    targetDates = Array.from({ length: days }, (_, i) =>
      isoDateOffset(yesterday, -i),
    ).reverse();
  } else {
    targetDates = [yesterday];
  }

  try {
    const result = await syncDates(targetDates);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
