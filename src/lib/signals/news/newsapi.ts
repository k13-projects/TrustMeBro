import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { NewsFetcher, NewsItem } from "./types";

// NewsAPI.org free tier: 100 req/day, 24-hour delay on articles. Enough for
// an hourly sweep with NBA-topic search.
type NewsApiArticle = {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  publishedAt: string;
  content: string | null;
};

const REPUTABLE_OUTLETS = new Set([
  "espn",
  "bleacher report",
  "yahoo entertainment",
  "yahoo sports",
  "cbs sports",
  "nbc sports",
  "the ringer",
  "the athletic",
  "sports illustrated",
  "fox sports",
  "the new york times",
  "the washington post",
]);

function trimToSentences(text: string, max = 3): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = sentences.slice(0, max).join(" ").trim();
  if (out.length > 360) out = out.slice(0, 357).trimEnd() + "…";
  return out;
}

async function loadRoster() {
  const supabase = supabaseAdmin();
  const [{ data: players }, { data: teams }] = await Promise.all([
    supabase.from("players").select("id, first_name, last_name"),
    supabase.from("teams").select("id, full_name, name"),
  ]);
  return {
    players: (players ?? []) as Array<{
      id: number;
      first_name: string;
      last_name: string;
    }>,
    teams: (teams ?? []) as Array<{ id: number; full_name: string; name: string }>,
  };
}

function tagMentions(text: string, roster: Awaited<ReturnType<typeof loadRoster>>) {
  const lowered = text.toLowerCase();
  const team_ids: number[] = [];
  for (const t of roster.teams) {
    if (t.name && t.name.length >= 4 && lowered.includes(t.name.toLowerCase())) {
      team_ids.push(t.id);
    }
  }
  const player_ids: number[] = [];
  for (const p of roster.players) {
    const last = p.last_name?.toLowerCase();
    if (!last || last.length < 4 || !lowered.includes(last)) continue;
    const first = p.first_name?.toLowerCase();
    if (first && first.length >= 3 && !lowered.includes(first)) continue;
    player_ids.push(p.id);
  }
  return {
    team_ids: [...new Set(team_ids)],
    player_ids: [...new Set(player_ids)],
  };
}

export class NewsApiFetcher implements NewsFetcher {
  key = "newsapi";

  async fetch(since: Date): Promise<NewsItem[]> {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) {
      // Env-gated: silently no-op so the cron stays green without the key.
      return [];
    }

    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set(
      "q",
      "NBA AND (preview OR matchup OR prediction OR analysis OR injury)",
    );
    url.searchParams.set("language", "en");
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("from", since.toISOString());

    const res = await fetch(url, {
      headers: { "X-Api-Key": apiKey },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      throw new Error(`newsapi ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as {
      status: string;
      articles: NewsApiArticle[];
    };
    if (json.status !== "ok" || !Array.isArray(json.articles)) return [];

    const roster = await loadRoster();
    const out: NewsItem[] = [];

    for (const a of json.articles) {
      const outletName = a.source?.name ?? "";
      if (!REPUTABLE_OUTLETS.has(outletName.toLowerCase())) continue;

      const summarySrc = a.description || a.content || a.title;
      const summary = trimToSentences(summarySrc, 3);
      if (!summary) continue;

      const text = `${a.title}. ${a.description ?? ""}`;
      const tags = tagMentions(text, roster);
      if (tags.team_ids.length === 0 && tags.player_ids.length === 0) continue;

      out.push({
        source: "newsapi",
        source_id: a.url,
        source_url: a.url,
        outlet: outletName,
        author: a.author,
        headline: a.title,
        summary,
        game_id: null,
        team_ids: tags.team_ids,
        player_ids: tags.player_ids,
        is_engine_take: false,
        published_at: a.publishedAt,
        raw: { source_id: a.source?.id ?? null },
      });
    }
    return out;
  }
}

export const newsApiFetcher = new NewsApiFetcher();
