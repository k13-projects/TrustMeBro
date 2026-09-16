import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

// The five soccer crons this log covers. /api/health reads exactly this
// list back out via getLastCronRuns.
export const SOCCER_CRON_JOBS = [
  "soccer/sync-fixtures",
  "soccer/track-odds",
  "soccer/generate-predictions",
  "soccer/settle-bets",
  "soccer/scrape-news",
] as const;

export type SoccerCronJob = (typeof SOCCER_CRON_JOBS)[number];

export type CronJobOutcome<T> =
  | { ok: true; summary: T }
  | { ok: false; error: string };

/**
 * Wraps a cron job with a row in `cron_runs` (migration 0035) so /api/health
 * can say which job last ran, whether it succeeded, and whether it's
 * overdue. Motivated by the 2026-09-16 ESPN date-range 400: both
 * sync-fixtures and settle-bets returned 500 in under a second and nothing
 * recorded that anywhere but the Vercel function logs, because
 * soccer_provider_health only ever tracked upstream host health, not "did
 * the job itself finish".
 *
 * Inserts a row at start, runs `fn`, always finishes that row (ok + summary
 * on success, ok:false + error on throw), and never rethrows -- the caller
 * gets a typed outcome back and decides its own HTTP response from it.
 */
export async function runCronJob<T>(
  job: SoccerCronJob | string,
  fn: () => Promise<T>,
): Promise<CronJobOutcome<T>> {
  const supabase = supabaseAdmin();
  const { data: row, error: insertErr } = await supabase
    .from("cron_runs")
    .insert({ job })
    .select("id")
    .single();
  if (insertErr) {
    // Logging the run is a nice-to-have; a logging failure must never stop
    // the job it's trying to log.
    console.error(`[cron-runs] insert failed for ${job}: ${insertErr.message}`);
  }
  const id = (row as { id?: number } | null)?.id;

  try {
    const summary = await fn();
    if (id !== undefined) {
      await supabase
        .from("cron_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: true,
          summary: summary as unknown as Record<string, unknown>,
        })
        .eq("id", id);
    }
    return { ok: true, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (id !== undefined) {
      await supabase
        .from("cron_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: false,
          error: message.slice(0, 2000),
        })
        .eq("id", id);
    }
    return { ok: false, error: message };
  }
}

export type CronRunStatus = {
  job: string;
  lastStartedAt: string | null;
  lastOk: boolean | null;
  lastError: string | null;
  overdue: boolean;
};

const OVERDUE_AFTER_MS = 26 * 3600 * 1000;

/**
 * Latest run + "has this succeeded recently" per job, in one query. Reads
 * the most recent handful of rows across all requested jobs and reduces
 * client-side, rather than one round trip per job -- cheap enough for
 * /api/health to call on every request without its own cache.
 *
 * A job with no row at all (freshly migrated, or genuinely never run) comes
 * back overdue:false with lastOk:null -- "unknown", not an alert. Same rule
 * as the provider block: nothing has reported yet is not a failure, and
 * crying wolf for a day after the migration lands would train the War Room
 * to ignore the strip. Tracking starts with each job's first logged run.
 */
export async function getLastCronRuns(
  jobs: readonly string[],
): Promise<CronRunStatus[]> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("cron_runs")
    .select("job, started_at, ok, error")
    .in("job", jobs)
    .order("started_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`load cron runs: ${error.message}`);

  const rows = (data ?? []) as Array<{
    job: string;
    started_at: string;
    ok: boolean | null;
    error: string | null;
  }>;

  const latestByJob = new Map<string, (typeof rows)[number]>();
  const lastSuccessByJob = new Map<string, string>();
  for (const row of rows) {
    if (!latestByJob.has(row.job)) latestByJob.set(row.job, row);
    if (row.ok === true && !lastSuccessByJob.has(row.job)) {
      lastSuccessByJob.set(row.job, row.started_at);
    }
  }

  const now = Date.now();
  return jobs.map((job) => {
    const latest = latestByJob.get(job) ?? null;
    const lastSuccessAt = lastSuccessByJob.get(job) ?? null;
    const overdue = latest
      ? !lastSuccessAt || now - new Date(lastSuccessAt).getTime() > OVERDUE_AFTER_MS
      : false;
    return {
      job,
      lastStartedAt: latest?.started_at ?? null,
      lastOk: latest?.ok ?? null,
      lastError: latest && latest.ok === false ? (latest.error?.slice(0, 300) ?? null) : null,
      overdue,
    };
  });
}
