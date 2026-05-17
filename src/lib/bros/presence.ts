import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

// "Online" = last_seen_at touched within this window. Five minutes is the
// sweet spot for "is this bro actively browsing right now" without needing
// a websocket. Tune up if the touch rhythm changes.
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

// In-process rate limit so we don't issue an UPDATE on every page nav.
// Lives for the lifetime of a Node serverless instance; cold starts drop it,
// which is fine — one extra UPDATE per cold start per user is nothing.
const lastTouched = new Map<string, number>();
const TOUCH_MIN_INTERVAL_MS = 60_000;

/**
 * Touch the auth user's profiles.last_seen_at if they have a profile.
 * Safe to call on every authenticated page render — rate-limited per user.
 * Silently no-ops when the user hasn't onboarded to Bro Board yet
 * (no profiles row); that's expected.
 *
 * Uses the service-role client because the layout context isn't always a
 * route handler — we don't want this to be at the mercy of RLS state in an
 * RSC. The UPDATE is constrained by user_id, so it can only ever touch the
 * caller's own row.
 */
export async function touchProfilePresence(userId: string): Promise<void> {
  const now = Date.now();
  const last = lastTouched.get(userId) ?? 0;
  if (now - last < TOUCH_MIN_INTERVAL_MS) return;
  lastTouched.set(userId, now);
  try {
    const admin = supabaseAdmin();
    await admin
      .from("profiles")
      .update({ last_seen_at: new Date(now).toISOString() })
      .eq("user_id", userId);
  } catch {
    // Don't break the page render on a presence hiccup.
    lastTouched.delete(userId);
  }
}

export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}
