import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  return NextResponse.json({
    ok: true,
    message: "generate-predictions not implemented yet",
    todo: [
      "Load today's games + expected starting lineups",
      "For each player above expected-minutes threshold, load history",
      "buildPrediction() across markets {points, rebounds, assists, threes_made}",
      "Persist to predictions table",
      "pickBetOfTheDay() and flag is_bet_of_the_day",
    ],
  });
}
