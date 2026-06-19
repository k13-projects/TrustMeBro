export type SoccerNewsItem = {
  source: string;
  source_id: string;
  source_url: string | null;
  outlet: string;
  author: string | null;
  headline: string | null;
  /** 1–3 sentence pitch shown on the feed. */
  summary: string;
  /** Card thumbnail; null → the page falls back to the tagged country flag. */
  image_url: string | null;
  match_id: number | null;
  /** soccer_teams ids — the subject countries. */
  team_ids: number[];
  /** Curated star names mentioned (no soccer players table to FK against). */
  player_names: string[];
  is_engine_take: boolean;
  published_at: string;
  raw?: Record<string, unknown>;
};

export interface SoccerNewsFetcher {
  /** Stable identifier for de-duping rows. */
  key: string;
  /** Pulls items more recent than `since`. */
  fetch(since: Date): Promise<SoccerNewsItem[]>;
}
