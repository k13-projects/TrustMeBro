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
import { runCronJob } from "@/lib/ingest/cron-runs";
import { finishSoccerSettlement, settleOneCompetition } from "@/lib/ingest/soccer-settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({ competition: z.string().optional() });

// Refreshes recent scores from ESPN (yesterday + today) for every LIVE
// competition, then settles pending predictions whose match is finished —
// updating that competition's ledger and resolving its engine coupons.
// Stuck/postponed matches are force-voided (voidStaleSoccerRows), then
// soccer_coupon_legs.status is written directly for both engine and
// user-picked legs (settleSoccerCouponLegs), and only then are user-built
// coupons graded off that leg status (settleSoccerCoupons) — see
// docs/handoffs/user-coupons-plan_2026-09-14.md section 2 for why the leg's
// own status, not a join through soccer_predictions, has to be the source of
// truth here. NBA's ledger and archived competitions' ledgers are never
// touched.
//
// Each competition runs inside its own try/catch (2026-09-16) so one
// competition's fixture sync failing (e.g. an upstream outage) doesn't stop
// the others from settling. The whole run is logged via runCronJob
// (cron_runs, migration 0035); the route itself returns 200 with ok:false
// and a per-competition `errors` map when some (not all) competitions
// failed, and 500 only when every competition failed.
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

  const outcome = await runCronJob("soccer/settle-bets", async () => {
    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const competition of competitions) {
      try {
        const sync = await syncCompetition({
          competition,
          from,
          to: today,
          standings: true,
        });
        // No skip guard needed here for an oddsKey: null competition — with
        // no engine predictions ever generated (see generate-predictions),
        // this is already a zero-row no-op, and fixture sync + score-call
        // grading below must still run regardless of odds.
        const settled = await settleOneCompetition(competition);
        results[competition] = { refreshed_matches: sync.matches, ...settled };
      } catch (err) {
        errors[competition] = err instanceof Error ? err.message : String(err);
      }
    }
    const finishing = await finishSoccerSettlement();
    const failedCount = Object.keys(errors).length;
    if (competitions.length > 0 && failedCount === competitions.length) {
      throw new Error(
        `every competition failed: ${JSON.stringify(errors)}`,
      );
    }
    return {
      competitions: results,
      errors: failedCount > 0 ? errors : undefined,
      ...finishing,
    };
  });

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 500 });
  }
  const anyFailed = outcome.summary.errors !== undefined;
  return NextResponse.json({ ok: !anyFailed, ...outcome.summary });
}
