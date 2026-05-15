import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  return NextResponse.json({
    ok: true,
    message: "settle-bets not implemented yet",
    todo: [
      "Find predictions where status='pending' and game is Final",
      "Look up actual stat value from player_game_stats",
      "Compare to line + pick to determine won/lost/void",
      "Update predictions.status, result_value, settled_at",
      "Call applyReward() to update system_score",
      "Mirror outcome onto user_bets rows that reference the prediction",
    ],
  });
}
