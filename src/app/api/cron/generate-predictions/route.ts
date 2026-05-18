import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../_auth";
import { generateForDate } from "@/lib/analysis/run";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().optional(),
  upcoming: z.coerce.number().int().min(0).max(7).optional(),
});

const DEFAULT_UPCOMING_DAYS = 1;

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

  const today = todayIsoDate();
  let targetDates: string[];
  if (parsed.data.date && isValidIsoDate(parsed.data.date)) {
    targetDates = [parsed.data.date];
  } else {
    const ahead = parsed.data.upcoming ?? DEFAULT_UPCOMING_DAYS;
    targetDates = [today];
    for (let i = 1; i <= ahead; i++) {
      targetDates.push(isoDateOffset(today, i));
    }
  }

  const results: Array<
    | { date: string; ok: true; result: Awaited<ReturnType<typeof generateForDate>> }
    | { date: string; ok: false; error: string }
  > = [];
  for (const date of targetDates) {
    try {
      const result = await generateForDate(date);
      results.push({ date, ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ date, ok: false, error: message });
    }
  }

  const anyFailed = results.some((r) => !r.ok);
  return NextResponse.json(
    { ok: !anyFailed, target_dates: targetDates, results },
    { status: anyFailed ? 500 : 200 },
  );
}
