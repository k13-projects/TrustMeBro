import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { NewsFetcher, NewsItem } from "./types";

/**
 * RSS item structure we extract. We don't pull a full XML library — RSS is
 * regular enough that targeted regex matches save us a dependency and a
 * parser-confusion surface area.
 */
type RssItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
};

const USER_AGENT =
  "TrustMeBro/0.1 (+https://github.com/k13-projects/TrustMeBro)";

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extract(item: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = item.match(re);
  return m ? decodeEntities(m[1]) : "";
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blockRe = /<item[\s>][\s\S]*?<\/item>/gi;
  const blocks = xml.match(blockRe) ?? [];
  for (const block of blocks) {
    items.push({
      title: extract(block, "title"),
      link: extract(block, "link"),
      description: extract(block, "description"),
      pubDate: extract(block, "pubDate"),
      guid: extract(block, "guid") || extract(block, "link"),
    });
  }
  return items;
}

/** Trim to first N sentences (≤ ~360 chars). */
function trimToSentences(text: string, max = 3): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = sentences.slice(0, max).join(" ").trim();
  if (out.length > 360) out = out.slice(0, 357).trimEnd() + "…";
  return out;
}

/**
 * Pull a roster snapshot for matching. Called once per fetch — small payload,
 * the players table is ~600 rows.
 */
async function loadRoster(): Promise<{
  players: Array<{ id: number; first_name: string; last_name: string; team_id: number | null }>;
  teams: Array<{ id: number; abbreviation: string; full_name: string; name: string }>;
}> {
  const supabase = supabaseAdmin();
  const [{ data: players }, { data: teams }] = await Promise.all([
    supabase.from("players").select("id, first_name, last_name, team_id"),
    supabase.from("teams").select("id, abbreviation, full_name, name"),
  ]);
  return {
    players: (players ?? []) as Array<{
      id: number;
      first_name: string;
      last_name: string;
      team_id: number | null;
    }>,
    teams: (teams ?? []) as Array<{
      id: number;
      abbreviation: string;
      full_name: string;
      name: string;
    }>,
  };
}

/** Find player/team mentions in free text. Naive substring match with
 *  last-name minimum length to avoid false positives like "Mac" / "Wade". */
function tagMentions(
  text: string,
  roster: Awaited<ReturnType<typeof loadRoster>>,
): { team_ids: number[]; player_ids: number[] } {
  const lowered = text.toLowerCase();
  const team_ids: number[] = [];
  for (const t of roster.teams) {
    const needle = t.name?.toLowerCase();
    const full = t.full_name?.toLowerCase();
    if (needle && needle.length >= 4 && lowered.includes(needle)) {
      team_ids.push(t.id);
      continue;
    }
    if (full && lowered.includes(full)) team_ids.push(t.id);
  }
  const player_ids: number[] = [];
  for (const p of roster.players) {
    const last = p.last_name?.toLowerCase();
    if (!last || last.length < 4) continue;
    if (!lowered.includes(last)) continue;
    const first = p.first_name?.toLowerCase();
    if (first && first.length >= 3 && !lowered.includes(first)) continue;
    player_ids.push(p.id);
  }
  return {
    team_ids: [...new Set(team_ids)],
    player_ids: [...new Set(player_ids)],
  };
}

/** Best-effort author from a writer-styled headline ("Lowe: …", "By Zach Lowe"). */
function guessAuthor(text: string): string | null {
  const colon = text.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*:/);
  if (colon) return colon[1];
  const by = text.match(/(?:^|\b)By\s+([A-Z][a-z]+\s[A-Z][a-z]+)/);
  if (by) return by[1];
  return null;
}

export type RssFeed = {
  url: string;
  outlet: string;
  /** Used as the source-key prefix and dedupe namespace. */
  source: string;
};

export const NBA_FEEDS: RssFeed[] = [
  // ESPN's top-line NBA headlines feed. Carries writers' analysis pieces
  // (Lowe, Windhorst, Bontemps) as well as breaking news.
  { url: "https://www.espn.com/espn/rss/nba/news", outlet: "ESPN", source: "rss:espn" },
  // Bleacher Report NBA tag feed.
  {
    url: "https://bleacherreport.com/articles/feed?tag_id=19",
    outlet: "Bleacher Report",
    source: "rss:bleacher",
  },
  // Yahoo NBA. Pulls AP-syndicated and Yahoo-bylined columns.
  { url: "https://sports.yahoo.com/nba/rss", outlet: "Yahoo Sports", source: "rss:yahoo" },
  // CBS Sports NBA headlines (substituting for NBC, which doesn't expose a
  // reliable public NBA-only RSS endpoint).
  {
    url: "https://www.cbssports.com/rss/headlines/nba/",
    outlet: "CBS Sports",
    source: "rss:cbs",
  },
];

export class RssNewsFetcher implements NewsFetcher {
  constructor(private feed: RssFeed) {}

  get key(): string {
    return this.feed.source;
  }

  async fetch(since: Date): Promise<NewsItem[]> {
    const res = await fetch(this.feed.url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      throw new Error(
        `${this.feed.source} ${res.status} ${res.statusText} on ${this.feed.url}`,
      );
    }
    const xml = await res.text();
    const items = parseRss(xml);
    if (items.length === 0) return [];

    const roster = await loadRoster();
    const out: NewsItem[] = [];

    for (const it of items) {
      const published = it.pubDate ? new Date(it.pubDate) : null;
      if (!published || Number.isNaN(published.getTime())) continue;
      if (published < since) continue;

      const text = `${it.title}. ${it.description}`;
      const tags = tagMentions(text, roster);
      // Skip items that don't reference a player or team — they're probably
      // generic NBA news (CBA, draft lottery odds, awards) not useful here.
      if (tags.team_ids.length === 0 && tags.player_ids.length === 0) continue;

      const summary = trimToSentences(it.description || it.title, 3);
      if (!summary) continue;

      out.push({
        source: this.feed.source,
        source_id: it.guid || it.link,
        source_url: it.link || null,
        outlet: this.feed.outlet,
        author: guessAuthor(it.title) || guessAuthor(it.description) || null,
        headline: it.title || null,
        summary,
        game_id: null,
        team_ids: tags.team_ids,
        player_ids: tags.player_ids,
        is_engine_take: false,
        published_at: published.toISOString(),
        raw: { feed: this.feed.url },
      });
    }
    return out;
  }
}

export const rssFetchers: NewsFetcher[] = NBA_FEEDS.map(
  (f) => new RssNewsFetcher(f),
);
