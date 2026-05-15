import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../_auth";
import { generateForDate } from "@/lib/analysis/run";
import { isValidIsoDate, todayIsoDate } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().optional(),
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
  const date =
    parsed.data.date && isValidIsoDate(parsed.data.date)
      ? parsed.data.date
      : todayIsoDate();

  try {
    const result = await generateForDate(date);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
