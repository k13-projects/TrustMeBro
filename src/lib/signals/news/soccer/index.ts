import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { soccerRssFetchers } from "./rss";
import { generateSoccerEngineTakes } from "./engine-take";
import type { SoccerNewsItem } from "./types";

export type SoccerNewsRunResult = {
  fetchers: Array<{ key: string; pulled: number; inserted: number; error?: string }>;
  engine_takes: { inserted: number; error?: string };
  total_inserted: number;
};

/**
 * Single entry-point for the soccer news cron. Mirror of ../index.ts: run every
 * feed, upsert into soccer_news, then fill commentary gaps for this week's
 * matches with engine takes.
 */
export async function runSoccerNewsIngest(opts?: {
  sinceHours?: number;
}): Promise<SoccerNewsRunResult> {
  const since = new Date(Date.now() - (opts?.sinceHours ?? 24) * 3600 * 1000);
  const out: SoccerNewsRunResult = {
    fetchers: [],
    engine_takes: { inserted: 0 },
    total_inserted: 0,
  };

  // Feeds run concurrently — the job is dominated by 7 sequential network
  // round-trips otherwise (~16s → ~4s). Each feed isolates its own failure.
  const fetched = await Promise.all(
    soccerRssFetchers.map(async (fetcher) => {
      try {
        const items = await fetcher.fetch(since);
        const inserted = items.length ? await upsertNews(items) : 0;
        return { key: fetcher.key, pulled: items.length, inserted };
      } catch (err) {
        return {
          key: fetcher.key,
          pulled: 0,
          inserted: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  out.fetchers = fetched;
  out.total_inserted += fetched.reduce((sum, r) => sum + r.inserted, 0);

  const today = todayIsoDate();
  const weekEnd = isoDateOffset(today, 7);
  try {
    const takes = await generateSoccerEngineTakes({
      startDate: today,
      endDate: weekEnd,
      maxMatches: 12,
    });
    if (takes.length > 0) {
      const inserted = await upsertNews(takes);
      out.engine_takes.inserted = inserted;
      out.total_inserted += inserted;
    }
  } catch (err) {
    out.engine_takes.error = err instanceof Error ? err.message : String(err);
  }

  return out;
}

async function upsertNews(items: SoccerNewsItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const supabase = supabaseAdmin();
  const { error, count } = await supabase
    .from("soccer_news")
    .upsert(items, { onConflict: "source,source_id", count: "exact" });
  if (error) throw new Error(`soccer_news upsert: ${error.message}`);
  return count ?? items.length;
}
