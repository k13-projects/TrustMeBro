import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

type RefreshOutcome = "ran" | "skipped" | "error";

/**
 * Single-flight, throttled background refresh. Runs `run()` at most once per
 * `staleAfterMs` across all callers, so a burst of visitors triggers one
 * refresh — not a stampede against the upstream feeds.
 *
 * The gate is one atomic conditional UPDATE on ingest_state: Postgres locks the
 * row, so among concurrent callers exactly one flips running false→true and
 * gets a row back; the rest match nothing and skip. A run that crashes leaves
 * running=true, recovered once `claimed_at` ages past `staleLockMs`.
 *
 * Call this from `after()` so it never blocks the response.
 */
export async function maybeRefresh(opts: {
  key: string;
  staleAfterMs: number;
  staleLockMs?: number;
  run: () => Promise<unknown>;
}): Promise<RefreshOutcome> {
  const { key, staleAfterMs, staleLockMs = 5 * 60_000, run } = opts;
  const supabase = supabaseAdmin();
  const now = Date.now();
  const staleBefore = new Date(now - staleAfterMs).toISOString();
  const lockBefore = new Date(now - staleLockMs).toISOString();
  const stamp = new Date(now).toISOString();

  // Make sure the bookkeeping row exists so any new key works without a seed.
  await supabase
    .from("ingest_state")
    .upsert({ key }, { onConflict: "key", ignoreDuplicates: true });

  const { data: claimed, error } = await supabase
    .from("ingest_state")
    .update({ running: true, claimed_at: stamp, updated_at: stamp })
    .eq("key", key)
    .or(
      [
        "and(running.eq.false,last_run_at.is.null)",
        `and(running.eq.false,last_run_at.lt.${staleBefore})`,
        `and(running.eq.true,claimed_at.lt.${lockBefore})`,
      ].join(","),
    )
    .select("key");

  if (error) return "error";
  if (!claimed || claimed.length === 0) return "skipped";

  try {
    await run();
    return "ran";
  } finally {
    const done = new Date().toISOString();
    await supabase
      .from("ingest_state")
      .update({ running: false, last_run_at: done, updated_at: done })
      .eq("key", key);
  }
}
