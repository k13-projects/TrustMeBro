import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SoccerNewsFetcher, SoccerNewsItem } from "./types";

/**
 * Soccer mirror of the NBA RSS fetcher (../rss.ts). Same regex extraction —
 * RSS is regular enough that a parser dependency isn't worth the surface area.
 * Differences: tags subjects against the World Cup country teams + a curated
 * star-player name list (no soccer players table), and pulls a thumbnail.
 */
type RssItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  /** Raw (un-decoded) <item> block — needed to sniff the thumbnail. */
  block: string;
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
      block,
    });
  }
  return items;
}

/** First usable thumbnail in an <item> block, else null. */
function extractImage(block: string): string | null {
  const media =
    block.match(/<media:content[^>]+url="([^"]+)"/i) ??
    block.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
  if (media) return media[1];
  const enclosure = block.match(
    /<enclosure[^>]+url="([^"]+)"[^>]*type="image\/[^"]+"/i,
  );
  if (enclosure) return enclosure[1];
  const img = block.match(/<img[^>]+src="([^"]+)"/i);
  if (img) return img[1];
  return null;
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

type TeamRow = { id: number; name: string; abbreviation: string };

async function loadTeams(): Promise<TeamRow[]> {
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("soccer_teams")
    .select("id, name, abbreviation");
  return (data ?? []) as TeamRow[];
}

// English/colloquial aliases for country names that won't substring-match the
// stored `name`. Keyed by soccer_teams.name.
const TEAM_ALIASES: Record<string, string[]> = {
  Türkiye: ["Turkey", "Turkish"],
  "United States": ["USA", "USMNT", "U.S."],
  "South Korea": ["Korea Republic", "Korean"],
  "Congo DR": ["DR Congo", "Congo"],
  "Bosnia-Herzegovina": ["Bosnia"],
  "Ivory Coast": ["Côte d'Ivoire", "Cote d'Ivoire"],
  "Cape Verde": ["Cabo Verde"],
  Czechia: ["Czech Republic", "Czech"],
  Netherlands: ["Dutch", "Holland"],
};

// Curated stars per side (no soccer players table). When a star is mentioned we
// also tag that star's country, so the subject country is right even if the
// country name never appears in the copy. Keyed by soccer_teams.name.
const STAR_PLAYERS: Record<string, string[]> = {
  Argentina: ["Messi", "Lautaro", "Julián Álvarez", "Julian Alvarez"],
  Brazil: ["Vinicius", "Vinícius", "Rodrygo", "Raphinha", "Neymar"],
  France: ["Mbappe", "Mbappé", "Griezmann", "Dembele", "Dembélé"],
  England: ["Bellingham", "Harry Kane", "Saka", "Foden"],
  Spain: ["Lamine Yamal", "Yamal", "Pedri", "Gavi", "Morata"],
  Portugal: ["Ronaldo", "Bruno Fernandes", "Rafael Leao", "Leão"],
  Netherlands: ["Van Dijk", "Depay", "Gakpo"],
  Germany: ["Musiala", "Wirtz", "Havertz", "Kimmich"],
  Belgium: ["De Bruyne", "Lukaku", "Doku"],
  Norway: ["Haaland", "Ødegaard", "Odegaard"],
  Croatia: ["Modric", "Modrić"],
  Türkiye: ["Güler", "Guler", "Çalhanoğlu", "Calhanoglu", "Yıldız", "Yildiz"],
  "United States": ["Pulisic", "McKennie", "Weah"],
  Egypt: ["Salah"],
  Morocco: ["Hakimi", "Ziyech"],
  Senegal: ["Mane", "Mané"],
  Uruguay: ["Núñez", "Nunez", "Valverde"],
  Mexico: ["Lozano", "Giménez", "Gimenez"],
  Japan: ["Mitoma", "Kubo"],
  "South Korea": ["Son Heung-min", "Heung-min", "Son"],
};

// Player names need a whole-word match: a bare substring lets "Son" hit inside
// "season". Teams stay on substring so adjective forms still match ("Iranian"
// → Iran, "Portuguese" → Portugal), which is what we want for country tagging.
function containsWord(lowered: string, needle: string): boolean {
  const escaped = needle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(lowered);
}

function tagMentions(
  text: string,
  teams: TeamRow[],
): { team_ids: number[]; player_names: string[] } {
  const lowered = text.toLowerCase();
  const team_ids = new Set<number>();
  const player_names = new Set<string>();
  for (const t of teams) {
    const aliases = [t.name, ...(TEAM_ALIASES[t.name] ?? [])];
    if (
      aliases.some((a) => a.length >= 4 && lowered.includes(a.toLowerCase()))
    ) {
      team_ids.add(t.id);
    }
    for (const star of STAR_PLAYERS[t.name] ?? []) {
      if (containsWord(lowered, star)) {
        player_names.add(star);
        team_ids.add(t.id);
      }
    }
  }
  return { team_ids: [...team_ids], player_names: [...player_names] };
}

/** Best-effort author from a writer-styled headline ("Marcotti: …"). */
function guessAuthor(text: string): string | null {
  const colon = text.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*:/);
  if (colon) return colon[1];
  const by = text.match(/(?:^|\b)By\s+([A-Z][a-z]+\s[A-Z][a-z]+)/);
  if (by) return by[1];
  return null;
}

export type SoccerRssFeed = {
  url: string;
  outlet: string;
  /** Source-key prefix and dedupe namespace. */
  source: string;
};

// English anchors + Google News query feeds (EN + TR) + Turkish sports. These
// are mixed-sport master feeds; the country/star tag-match below drops anything
// that doesn't reference a World Cup side, so non-WC items fall away on their
// own. A dead feed only fails its own pull — runSoccerNewsIngest isolates each.
export const SOCCER_FEEDS: SoccerRssFeed[] = [
  { url: "https://www.espn.com/espn/rss/soccer/news", outlet: "ESPN", source: "rss:espnfc" },
  {
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    outlet: "BBC Sport",
    source: "rss:bbc",
  },
  {
    url: "https://news.google.com/rss/search?q=FIFA+World+Cup&hl=en-US&gl=US&ceid=US:en",
    outlet: "Google News",
    source: "rss:gnews-en",
  },
  {
    url: "https://news.google.com/rss/search?q=D%C3%BCnya+Kupas%C4%B1&hl=tr&gl=TR&ceid=TR:tr",
    outlet: "Google Haberler",
    source: "rss:gnews-tr",
  },
  {
    url: "https://www.hurriyet.com.tr/rss/spor",
    outlet: "Hürriyet",
    source: "rss:hurriyet",
  },
  {
    url: "https://www.fotomac.com.tr/rss/anasayfa.xml",
    outlet: "Fotomaç",
    source: "rss:fotomac",
  },
  {
    url: "https://www.sabah.com.tr/rss/spor.xml",
    outlet: "Sabah Spor",
    source: "rss:sabah",
  },
];

export class SoccerRssNewsFetcher implements SoccerNewsFetcher {
  constructor(private feed: SoccerRssFeed) {}

  get key(): string {
    return this.feed.source;
  }

  async fetch(since: Date): Promise<SoccerNewsItem[]> {
    const res = await fetch(this.feed.url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/xml, text/xml",
      },
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

    const teams = await loadTeams();
    const out: SoccerNewsItem[] = [];

    for (const it of items) {
      const published = it.pubDate ? new Date(it.pubDate) : null;
      if (!published || Number.isNaN(published.getTime())) continue;
      if (published < since) continue;

      const text = `${it.title}. ${it.description}`;
      const tags = tagMentions(text, teams);
      // Drop items that don't reference a World Cup side — generic football
      // (transfers, domestic leagues) isn't what this feed is for.
      if (tags.team_ids.length === 0) continue;

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
        image_url: extractImage(it.block),
        match_id: null,
        team_ids: tags.team_ids,
        player_names: tags.player_names,
        is_engine_take: false,
        published_at: published.toISOString(),
        raw: { feed: this.feed.url },
      });
    }
    return out;
  }
}

export const soccerRssFetchers: SoccerNewsFetcher[] = SOCCER_FEEDS.map(
  (f) => new SoccerRssNewsFetcher(f),
);
