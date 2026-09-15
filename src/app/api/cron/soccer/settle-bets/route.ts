import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCronAuth } from "../../_auth";
import { isoDateOffset, todayIsoDate } from "@/lib/date";
import {
  isCompetition,
  liveCompetitions,
  type SoccerCompetition,
} from "@/lib/sports/soccer/competitions";
import { syncCompetition } from "@/lib/sports/soccer/live";
import { settleSoccer } from "@/lib/analysis/soccer/settle";
import { gradeScoreCalls } from "@/lib/analysis/soccer/grade-calls";
import { settleSoccerCoupons } from "@/lib/scoring/settle-coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({ competition: z.string().optional() });

// Refreshes recent scores from ESPN (yesterday + today) for every LIVE
// competition, then settles pending predictions whose match is finished —
// updating that competition's ledger and resolving its engine coupons. Once
// predictions grade, user-built soccer coupons are settled too. NBA's ledger
// and archived competitions' ledgers are never touched.
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  let competitions: SoccerCompetition[];
  if (parsed.success && parsed.data.competition) {
    if (!isCompetition(parsed.data.competition)) {
      return NextResponse.json({ error: "unknown competition" }, { status: 400 });
    }
    competitions = [parsed.data.competition];
  } else {
    competitions = liveCompetitions();
  }

  const today = todayIsoDate();
  const from = isoDateOffset(today, -1);

  const results: Record<string, unknown> = {};
  for (const competition of competitions) {
    const sync = await syncCompetition({
      competition,
      from,
      to: today,
      standings: true,
    });
    // No skip guard needed here for an oddsKey: null competition — with no
    // engine predictions ever generated (see generate-predictions), this is
    // already a zero-row no-op, and fixture sync + score-call grading below
    // must still run regardless of odds.
    const settled = await settleSoccer(competition);
    // Bros' score calls grade off the same final scores (3 exact / 1 result).
    const calls_graded = await gradeScoreCalls(competition);
    results[competition] = { refreshed_matches: sync.matches, ...settled, calls_graded };
  }
  const userCoupons = await settleSoccerCoupons();

  return NextResponse.json({
    ok: true,
    competitions: results,
    user_coupons: userCoupons,
  });
}
