import "server-only";

import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncDates } from "@/lib/sports/nba/sync";
import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { settlePending } from "./settle";
import { settleCoupons } from "./settle-coupons";

// In-process debounce. A second call within the window is a no-op so a busy
// page (homepage + scorecard + history rendered back-to-back) doesn't
// hammer ESPN or the DB.
const DEBOUNCE_MS = 5 * 60 * 1000;
// Don't try to settle a game until at least this much time has passed since
// tip-off. NBA games take ~2h15m; we wait a bit longer for ESPN's status to
// flip to "Final" and stat lines to land.
const GAME_GRACE_MS = 3 * 60 * 60 * 1000;

let lastRunAt = 0;

/**
 * Self-healing settle. Schedules a fire-and-forget sync+settle when there
 * are pending predictions on games whose scheduled time is well in the past
 * but which the daily cron hasn't picked up yet.
 *
 * Why this exists: on Vercel Hobby, settle-bets runs once a day at 11 UTC.
 * Games that finalize after that window sit on "pending" until the next
 * day's cron. This hook closes the gap whenever a user actually loads a
 * page that would show stale state.
 */
export function scheduleSelfHealingSettle(): void {
  const now = Date.now();
  if (now - lastRunAt < DEBOUNCE_MS) return;
  lastRunAt = now;

  after(async () => {
    try {
      const supabase = supabaseAdmin();
      const cutoff = new Date(Date.now() - GAME_GRACE_MS).toISOString();

      // One row is enough — we only need to know if anything is stuck.
      const { data: stuck, error } = await supabase
        .from("predictions")
        .select("game_id, games!inner(datetime, status)")
        .eq("status", "pending")
        .lt("games.datetime", cutoff)
        .not("games.status", "ilike", "%final%")
        .limit(1);
      if (error || !stuck || stuck.length === 0) return;

      const today = todayIsoDate();
      const yesterday = isoDateOffset(today, -1);
      const dayBefore = isoDateOffset(today, -2);
      await syncDates([dayBefore, yesterday, today]);
      await settlePending();
      await settleCoupons();
    } catch (err) {
      console.warn("scheduleSelfHealingSettle failed:", err);
    }
  });
}
