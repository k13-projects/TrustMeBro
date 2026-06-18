import { NextResponse } from "next/server";
import { assertCronAuth } from "../../_auth";
import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { soccerProvider } from "@/lib/sports/soccer";
import { upsertMatches } from "@/lib/sports/soccer/repo";
import { settleSoccer } from "@/lib/analysis/soccer/settle";
import { settleSoccerCoupons } from "@/lib/scoring/settle-coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Refreshes recent match scores from ESPN (yesterday + today), then settles
// any pending predictions whose match is finished — updating the soccer engine
// ledger and resolving engine coupons. Once predictions grade, user-built
// soccer coupons are settled too. NBA's ledger is never touched.
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  const today = todayIsoDate();
  const dates = [isoDateOffset(today, -1), today];

  const provider = soccerProvider();
  const matches = await provider.listMatches({ dates });
  await upsertMatches(matches);

  const result = await settleSoccer();
  const userCoupons = await settleSoccerCoupons();

  return NextResponse.json({
    ok: true,
    refreshed_matches: matches.length,
    ...result,
    user_coupons: userCoupons,
  });
}
