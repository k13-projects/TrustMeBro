import { NextResponse } from "next/server";
import { assertCronAuth } from "../_auth";
import { seedTeamsAndAllPlayers } from "@/lib/sports/nba/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Idempotent seed for every NBA team + every active player. Run this once
 * after deploy (or any time the provider's roster shifts substantially) so
 * `/teams/[id]` and `/players/[id]` work for the whole league, not just
 * teams that happen to have a game in the latest sync-stats window.
 */
export async function GET(req: Request) {
  const unauth = assertCronAuth(req);
  if (unauth) return unauth;

  try {
    const result = await seedTeamsAndAllPlayers();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
