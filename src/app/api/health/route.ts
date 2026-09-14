import { NextResponse } from "next/server";
import {
  PRIMARY_SOURCE,
  SOURCE_LABEL,
  getProviderHealth,
} from "@/lib/sports/soccer/provider-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, unauthenticated, and deliberately boring: one row, no secrets, no
// personal data, nothing an outsider couldn't already see on the football
// pages. It exists so a monitor can ask "is this site telling the truth
// today?" rather than "does it return a page?" — during the September outage
// every page answered 200 while the data behind them sat three days stale.
//
// Read by the K13 War Room's `selftest --live` canary, which raises the
// board's alert strip when `status` is anything but "ok". The response stays
// 200 even when degraded so the reader always gets the detail; the state is
// in the body, never in the status code.

export async function GET() {
  const health = await getProviderHealth();

  const body = health
    ? {
        status: health.status,
        source: health.activeSource,
        sourceLabel: SOURCE_LABEL[health.activeSource] ?? health.activeSource,
        onPrimary: health.activeSource === PRIMARY_SOURCE,
        since: health.since,
        lastOkAt: health.lastOkAt,
        lastError: health.status === "ok" ? null : health.lastError,
        consecutiveFailures: health.consecutiveFailures,
      }
    : {
        // No row yet means nothing has reported either way. That is not a
        // failure, and calling it one would cry wolf on a fresh database.
        status: "unknown" as const,
        source: null,
        sourceLabel: null,
        onPrimary: null,
        since: null,
        lastOkAt: null,
        lastError: null,
        consecutiveFailures: 0,
      };

  return NextResponse.json(
    { service: "trustmebro", checkedAt: new Date().toISOString(), providers: body },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
