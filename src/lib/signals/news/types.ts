export type NewsItem = {
  source: string;
  source_id: string;
  source_url: string | null;
  outlet: string;
  author: string | null;
  headline: string | null;
  /** 1–3 sentence pitch shown on the feed. */
  summary: string;
  game_id: number | null;
  team_ids: number[];
  player_ids: number[];
  is_engine_take: boolean;
  published_at: string;
  raw?: Record<string, unknown>;
};

export interface NewsFetcher {
  /** Stable identifier for de-duping rows. */
  key: string;
  /** Pulls items more recent than `since`. */
  fetch(since: Date): Promise<NewsItem[]>;
}
