import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  return NextResponse.json({
    ok: true,
    message: "track-odds not implemented yet",
    todo: [
      "Choose odds provider (The Odds API or similar)",
      "Poll player-prop markets for today's games",
      "Snapshot to odds_snapshots",
      "Detect line/odds movement vs previous snapshot",
      "Emit odds_movement signal when meaningful (>5% odds shift)",
    ],
  });
}
