import { NextResponse } from "next/server";
import {
  PRIMARY_SOURCE,
  SOURCE_LABEL,
  getProviderHealth,
} from "@/lib/sports/soccer/provider-health";
import { SOCCER_CRON_JOBS, getLastCronRuns } from "@/lib/ingest/cron-runs";

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
//
// `crons` (2026-09-16) closes a gap providers-only health couldn't see: the
// ESPN date-range 400 that day left soccer_provider_health green (fetchJson
// only recorded a failure on 403/5xx) while both sync-fixtures and
// settle-bets silently failed in under a second. This reads the cron_runs
// log (migration 0035) via runCronJob's bookkeeping, so a job that failed or
// simply hasn't run in 26h+ shows up here even when every upstream host is
// answering fine.

export async function GET() {
  // The cron log must never take health down with it: before migration 0035
  // lands (or if the table is ever unreachable) the block reads as
  // unavailable and the rest of the report still answers.
  const [health, cronRuns] = await Promise.all([
    getProviderHealth(),
    getLastCronRuns(SOCCER_CRON_JOBS).catch((err: unknown) => {
      console.error("[health] cron log unavailable:", err instanceof Error ? err.message : err);
      return [] as Awaited<ReturnType<typeof getLastCronRuns>>;
    }),
  ]);

  const crons = cronRuns.map((c) => ({
    job: c.job,
    lastStartedAt: c.lastStartedAt,
    ok: c.lastOk,
    overdue: c.overdue,
    error: c.lastError,
  }));
  const cronsIssue = cronRuns.some((c) => c.overdue || c.lastOk === false);

  const providers = health
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

  // Overall status folds in both signals: a healthy provider with an overdue
  // or failing cron is still not "ok" -- that's exactly the shape the
  // 2026-09-16 outage took (upstream answered fine, our own job didn't run).
  // No provider row AND no cron issue is "unknown" (fresh database, nothing
  // has reported either way yet), same meaning as before this block existed.
  const status: "ok" | "degraded" | "unknown" = !health
    ? cronsIssue
      ? "degraded"
      : "unknown"
    : health.status === "degraded" || cronsIssue
      ? "degraded"
      : "ok";

  return NextResponse.json(
    {
      service: "trustmebro",
      checkedAt: new Date().toISOString(),
      status,
      providers,
      crons,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
