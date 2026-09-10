import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../../_auth";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import {
  isCompetition,
  liveCompetitions,
  type SoccerCompetition,
} from "@/lib/sports/soccer/competitions";
import { syncCompetition } from "@/lib/sports/soccer/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const QuerySchema = z.object({
  competition: z.string().optional(),
  date: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  ahead: z.coerce.number().int().min(0).max(400).optional(),
  back: z.coerce.number().int().min(0).max(400).optional(),
});

// Pulls fixtures + scores for every LIVE competition over a date window
// (default: yesterday → +3 days, so finished games settle and upcoming games
// are ready for odds) and a standings snapshot. `from`/`to` (or `back`/`ahead`)
// widen the window for a backfill; `competition=` targets one competition,
// including an archived one if you ever need to re-pull its record. ESPN's
// soccer API is free — no credit cost.
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
  const q = parsed.data;

  const today = todayIsoDate();
  let from: string;
  let to: string;
  if (q.date && isValidIsoDate(q.date)) {
    from = to = q.date;
  } else if (q.from && q.to && isValidIsoDate(q.from) && isValidIsoDate(q.to)) {
    from = q.from;
    to = q.to;
  } else {
    from = isoDateOffset(today, -(q.back ?? 1));
    to = isoDateOffset(today, q.ahead ?? 3);
  }

  let competitions: SoccerCompetition[];
  if (q.competition) {
    if (!isCompetition(q.competition)) {
      return NextResponse.json({ error: "unknown competition" }, { status: 400 });
    }
    competitions = [q.competition];
  } else {
    competitions = liveCompetitions();
  }

  const results: Record<string, unknown> = {};
  for (const competition of competitions) {
    results[competition] = await syncCompetition({ competition, from, to });
  }

  return NextResponse.json({ ok: true, from, to, competitions: results });
}
