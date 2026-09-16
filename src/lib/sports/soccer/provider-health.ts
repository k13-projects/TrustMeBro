import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Which upstream is serving football data, and whether anyone has been told.
//
// The September 2026 outage taught the lesson this module exists for: an
// upstream can fail in a way that looks exactly like "quiet week" from the
// outside. Failures are recorded, the site says so on the page, and the
// transition into and out of trouble fires an alert.

export type SourceId = "espn-site-web" | "espn-site" | "uefa" | "espn-core";

export const SOURCE_LABEL: Record<SourceId, string> = {
  "espn-site-web": "ESPN",
  "espn-site": "ESPN (secondary host)",
  uefa: "UEFA",
  "espn-core": "ESPN (backup feed)",
};

/** Anything other than the primary means we are running on a fallback. */
export const PRIMARY_SOURCE: SourceId = "espn-site-web";

export type ProviderHealth = {
  status: "ok" | "degraded";
  activeSource: SourceId;
  since: string;
  lastOkAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
};

// Writing on every upstream call would be louder than the data it guards, so
// successes are throttled per process; a change of state always writes.
let lastOkWrite = 0;
const OK_WRITE_INTERVAL_MS = 5 * 60_000;

export async function getProviderHealth(): Promise<ProviderHealth | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_provider_health")
    .select("status, active_source, since, last_ok_at, last_error, consecutive_failures")
    .eq("id", true)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status as ProviderHealth["status"],
    activeSource: data.active_source as SourceId,
    since: data.since as string,
    lastOkAt: (data.last_ok_at as string | null) ?? null,
    lastError: (data.last_error as string | null) ?? null,
    consecutiveFailures: Number(data.consecutive_failures ?? 0),
  };
}

async function currentRow() {
  const { data } = await supabaseAdmin()
    .from("soccer_provider_health")
    .select("status, active_source, since, consecutive_failures")
    .eq("id", true)
    .maybeSingle();
  return data;
}

/** Called when a request succeeded, naming the host that served it. */
export async function recordSuccess(source: SourceId): Promise<void> {
  const now = new Date().toISOString();
  const row = await currentRow();
  const wasDegraded = row?.status === "degraded";
  const sourceChanged = row?.active_source !== source;
  const stale = Date.now() - lastOkWrite > OK_WRITE_INTERVAL_MS;
  if (!wasDegraded && !sourceChanged && !stale) return;

  const backOnPrimary = wasDegraded && source === PRIMARY_SOURCE;
  lastOkWrite = Date.now();

  await supabaseAdmin()
    .from("soccer_provider_health")
    .update({
      status: source === PRIMARY_SOURCE ? "ok" : "degraded",
      active_source: source,
      since: sourceChanged ? now : (row?.since ?? now),
      last_ok_at: now,
      // A success clears the stale error text -- without this a row could
      // read status:"ok" while last_error still showed whatever last failed
      // (verified live: a simulated-outage row stayed "ok" with a leftover
      // 'simulated outage for testing' message after recovering).
      last_error: null,
      consecutive_failures: 0,
      updated_at: now,
    })
    .eq("id", true);

  if (backOnPrimary) {
    await supabaseAdmin()
      .from("soccer_provider_incidents")
      .update({ ended_at: now })
      .is("ended_at", null);
    await alert(
      `✅ TrustMeBro: football data is back on ${SOURCE_LABEL[PRIMARY_SOURCE]}.`,
    );
  }
}

/** Called when the primary failed and we had to reach for something else. */
export async function recordFailure(
  source: SourceId,
  error: string,
): Promise<void> {
  const now = new Date().toISOString();
  const row = await currentRow();
  const wasOk = row?.status !== "degraded";

  await supabaseAdmin()
    .from("soccer_provider_health")
    .update({
      status: "degraded",
      active_source: source,
      since: wasOk ? now : (row?.since ?? now),
      last_failure_at: now,
      last_error: error.slice(0, 400),
      consecutive_failures: Number(row?.consecutive_failures ?? 0) + 1,
      updated_at: now,
    })
    .eq("id", true);

  if (wasOk) {
    await supabaseAdmin()
      .from("soccer_provider_incidents")
      .insert({ source, error: error.slice(0, 400) });
    await alert(
      `⚠️ TrustMeBro: ${SOURCE_LABEL[PRIMARY_SOURCE]} is failing, running on a fallback.\n${error.slice(0, 300)}`,
    );
  }
}

/**
 * Sends the alert if somewhere to send it has been configured. Accepts a
 * Discord, Slack or generic webhook: all three read one of these fields.
 * Without the variable the incident is still recorded and shown on the site.
 */
async function alert(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    console.warn("[provider-health]", message);
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, text: message, message }),
    });
  } catch (err) {
    console.error("[provider-health] alert failed", err);
  }
}
