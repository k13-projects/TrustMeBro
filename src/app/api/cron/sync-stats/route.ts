import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  return NextResponse.json({
    ok: true,
    message: "sync-stats not implemented yet",
    todo: [
      "Pull yesterday's games from balldontlie",
      "Pull per-player box scores",
      "Upsert into player_game_stats with is_home flag",
      "Update games.status / scores",
    ],
  });
}
