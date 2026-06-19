import { NextResponse } from "next/server";

// NBA season is over. Rather than delete the daily cron schedule (and have to
// reconstruct it next season), each NBA cron early-exits when NBA_LIGHT_MODE is
// set. Soccer crons never call this. Unset the env var to wake the NBA side.
export function nbaLightMode(): NextResponse | null {
  if (process.env.NBA_LIGHT_MODE === "true") {
    return NextResponse.json({ ok: true, skipped: true, reason: "NBA_LIGHT_MODE" });
  }
  return null;
}
