import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { rssFetchers } from "./rss";
import { newsApiFetcher } from "./newsapi";
import { generateEngineTakes } from "./engine-take";
import type { NewsItem } from "./types";

const ALL_FETCHERS = [...rssFetchers, newsApiFetcher];

export type RunResult = {
  fetchers: Array<{ key: string; pulled: number; inserted: number; error?: string }>;
  engine_takes: { inserted: number; error?: string };
  total_inserted: number;
};

/**
 * Single entry-point for the cron. Runs every news fetcher, upserts results,
 * then asks the engine to fill in commentary gaps for this week's games.
 */
export async function runNewsIngest(opts?: { sinceHours?: number }): Promise<RunResult> {
  const since = new Date(Date.now() - (opts?.sinceHours ?? 24) * 3600 * 1000);
  const supabase = supabaseAdmin();
  const out: RunResult = {
    fetchers: [],
    engine_takes: { inserted: 0 },
    total_inserted: 0,
  };

  for (const fetcher of ALL_FETCHERS) {
    try {
      const items = await fetcher.fetch(since);
      if (items.length === 0) {
        out.fetchers.push({ key: fetcher.key, pulled: 0, inserted: 0 });
        continue;
      }
      const inserted = await upsertNews(items);
      out.fetchers.push({ key: fetcher.key, pulled: items.length, inserted });
      out.total_inserted += inserted;
    } catch (err) {
      out.fetchers.push({
        key: fetcher.key,
        pulled: 0,
        inserted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // This-week window for engine fallbacks. "This week" = today + 7 days.
  const today = todayIsoDate();
  const weekEnd = isoDateOffset(today, 7);
  try {
    const takes = await generateEngineTakes({
      startDate: today,
      endDate: weekEnd,
      maxGames: 12,
    });
    if (takes.length > 0) {
      const inserted = await upsertNews(takes);
      out.engine_takes.inserted = inserted;
      out.total_inserted += inserted;
    }
  } catch (err) {
    out.engine_takes.error = err instanceof Error ? err.message : String(err);
  }

  void supabase;
  return out;
}

async function upsertNews(items: NewsItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const supabase = supabaseAdmin();
  const { error, count } = await supabase
    .from("news_items")
    .upsert(items, { onConflict: "source,source_id", count: "exact" });
  if (error) throw new Error(`news_items upsert: ${error.message}`);
  return count ?? items.length;
}
