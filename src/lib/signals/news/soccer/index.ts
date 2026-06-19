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

  for (const fetcher of soccerRssFetchers) {
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
