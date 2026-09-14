import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  COMPETITIONS,
  type SoccerCompetition,
} from "@/lib/sports/soccer/competitions";
import type { SoccerNewsFetcher, SoccerNewsItem } from "./types";

/**
 * Soccer mirror of the NBA RSS fetcher (../rss.ts). Same regex extraction —
 * RSS is regular enough that a parser dependency isn't worth the surface area.
 * Differences: tags subjects against the competition's teams (World Cup
 * countries, or the clubs in this season's Champions League) + a curated
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

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

const unescapeOnce = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

// Feeds vary in how many times they escape: Google News ships `&amp;nbsp;`,
// which only becomes a real space after a second pass. Two passes is enough
// for everything we have seen and leaves ordinary text alone.
const unescape = (s: string) => unescapeOnce(unescapeOnce(s));

// Google News (and some Turkish desks) ship the description as entity-encoded
// HTML (`&lt;a href=…&gt;`), so a single strip-then-decode pass would leave a
// literal <a href="…"> in the summary. Strip, decode, strip again.
function decodeEntities(s: string): string {
  return stripTags(unescape(stripTags(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))))
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
  if (media) return imageUrl(media[1]);
  const enclosure = block.match(
    /<enclosure[^>]+url="([^"]+)"[^>]*type="image\/[^"]+"/i,
  );
  if (enclosure) return imageUrl(enclosure[1]);
  const img = block.match(/<img[^>]+src="([^"]+)"/i);
  if (img) return imageUrl(img[1]);
  return null;
}

// URLs come out of the XML attribute still escaped, so a query string reads
// "?t=max&amp;s=abc" and the request 404s. Decode, and drop anything that
// isn't a plain http(s) URL rather than rendering a broken thumbnail.
function imageUrl(raw: string): string | null {
  const url = unescape(raw.trim());
  return /^https?:\/\//i.test(url) ? url : null;
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

// Teams that actually play in the competition — derived from its fixtures so
// a club that shows up in the Champions League feed is tagged, and a World Cup
// country never gets tagged onto a Champions League story.
async function loadTeams(competition: SoccerCompetition): Promise<TeamRow[]> {
  const supabase = supabaseAdmin();
  const { data: matches } = await supabase
    .from("soccer_matches")
    .select("home_team_id, away_team_id")
    .eq("competition", competition)
    .limit(2000);
  const ids = new Set<number>();
  for (const m of matches ?? []) {
    ids.add(m.home_team_id);
    ids.add(m.away_team_id);
  }
  if (ids.size === 0) return [];
  const { data } = await supabase
    .from("soccer_teams")
    .select("id, name, abbreviation")
    .in("id", [...ids]);
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

// Club nicknames / short forms the press uses that won't substring-match the
// ESPN name. Keyed by soccer_teams.name (ESPN spelling).
const CLUB_ALIASES: Record<string, string[]> = {
  Internazionale: ["Inter Milan", "Inter"],
  "Paris Saint-Germain": ["PSG", "Paris SG"],
  "Manchester United": ["Man United", "Man Utd", "United"],
  "Manchester City": ["Man City", "City"],
  "Tottenham Hotspur": ["Tottenham", "Spurs"],
  "Bayern Munich": ["Bayern", "Bayern München"],
  "Borussia Dortmund": ["Dortmund", "BVB"],
  "Bayer Leverkusen": ["Leverkusen"],
  "Atlético Madrid": ["Atletico Madrid", "Atlético", "Atletico"],
  "Real Madrid": ["Madrid", "Los Blancos"],
  Barcelona: ["Barça", "Barca"],
  "Sporting CP": ["Sporting Lisbon", "Sporting"],
  "FC Porto": ["Porto"],
  "PSV Eindhoven": ["PSV"],
  "Feyenoord Rotterdam": ["Feyenoord"],
  "Club Brugge": ["Brugge", "Bruges"],
  Fenerbahce: ["Fenerbahçe", "Fener"],
  Galatasaray: ["Gala", "Cimbom"],
  "Slavia Prague": ["Slavia Praha", "Slavia"],
  "Shakhtar Donetsk": ["Shakhtar"],
  "Bodo/Glimt": ["Bodø/Glimt", "Bodo Glimt", "Bodø"],
  "VfB Stuttgart": ["Stuttgart"],
  "RB Leipzig": ["Leipzig"],
  "AS Roma": ["Roma"],
  Napoli: ["SSC Napoli"],
  "Aston Villa": ["Villa"],
  "Real Betis": ["Betis"],
  "AEK Athens": ["AEK"],
  "LASK Linz": ["LASK"],
  "Viking FK": ["Viking"],
  "Sabah FK": ["Sabah"],
  "Slovan Bratislava": ["Slovan"],
  "Union St.-Gilloise": ["Union Saint-Gilloise", "Union SG", "USG"],
  "Red Star Belgrade": ["Crvena Zvezda", "Red Star"],
  Olympiacos: ["Olympiakos"],
  "Dinamo Zagreb": ["Dinamo"],
  "Sparta Prague": ["Sparta Praha", "Sparta"],
  Celtic: ["Celtic FC", "the Hoops"],
  Lyon: ["Olympique Lyonnais", "OL"],
};

// Curated club stars (best-effort; transfers move them). When a star is
// mentioned we tag their club too. Keyed by soccer_teams.name (ESPN spelling).
const CLUB_STARS: Record<string, string[]> = {
  "Real Madrid": ["Mbappe", "Mbappé", "Bellingham", "Vinicius", "Vinícius", "Rodrygo", "Valverde", "Courtois", "Arda Güler", "Arda Guler", "Xabi Alonso"],
  Barcelona: ["Lamine Yamal", "Yamal", "Pedri", "Raphinha", "Lewandowski", "Gavi", "Flick"],
  "Manchester City": ["Haaland", "Rodri", "Foden", "Guardiola", "Bernardo Silva", "Cherki"],
  "Manchester United": ["Bruno Fernandes", "Amorim", "Cunha", "Mbeumo", "Sesko"],
  Liverpool: ["Salah", "Van Dijk", "Wirtz", "Isak", "Ekitike", "Slot", "Alisson"],
  Arsenal: ["Saka", "Ødegaard", "Odegaard", "Gyökeres", "Gyokeres", "Arteta", "Rice", "Havertz"],
  "Paris Saint-Germain": ["Dembele", "Dembélé", "Hakimi", "Vitinha", "Kvaratskhelia", "Donnarumma", "Luis Enrique", "Doue", "Doué"],
  "Bayern Munich": ["Harry Kane", "Kane", "Musiala", "Olise", "Kompany", "Neuer", "Luis Díaz", "Luis Diaz"],
  "Borussia Dortmund": ["Guirassy", "Adeyemi", "Brandt"],
  Internazionale: ["Lautaro", "Thuram", "Barella", "Calhanoglu", "Çalhanoğlu", "Chivu"],
  Napoli: ["De Bruyne", "McTominay", "Lukaku", "Conte", "Osimhen"],
  "AS Roma": ["Dybala", "Gasperini"],
  "Atlético Madrid": ["Griezmann", "Julián Álvarez", "Julian Alvarez", "Simeone"],
  "Aston Villa": ["Emery", "Watkins", "Rogers"],
  Galatasaray: ["Osimhen", "Icardi", "Sané", "Sane", "Barış Alper", "Baris Alper", "Okan Buruk"],
  Fenerbahce: ["Mourinho", "Tedesco", "Talisca", "Kerem Aktürkoğlu", "Kerem Akturkoglu", "En-Nesyri"],
  "Sporting CP": ["Trincão", "Trincao", "Gyökeres"],
  "Club Brugge": ["Vanaken"],
  "PSV Eindhoven": ["Bosz"],
  "RB Leipzig": ["Openda", "Šeško", "Sesko"],
  "VfB Stuttgart": ["Undav"],
  Villarreal: ["Marcelino"],
  "Shakhtar Donetsk": ["Turan"],
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
  kind: "national" | "club",
): { team_ids: number[]; player_names: string[] } {
  const lowered = text.toLowerCase();
  const team_ids = new Set<number>();
  const player_names = new Set<string>();
  const aliasTable = kind === "club" ? CLUB_ALIASES : TEAM_ALIASES;
  const starTable = kind === "club" ? CLUB_STARS : STAR_PLAYERS;
  for (const t of teams) {
    const aliases = [t.name, ...(aliasTable[t.name] ?? [])];
    // Countries match on substring so adjective forms land ("Portuguese").
    // Clubs match on whole words: "Como" must not fire inside "become", and
    // "City" / "United" only count as the full name.
    const hit =
      kind === "club"
        ? aliases.some((a) => a.length >= 3 && containsWord(lowered, a))
        : aliases.some((a) => a.length >= 4 && lowered.includes(a.toLowerCase()));
    if (hit) team_ids.add(t.id);
    for (const star of starTable[t.name] ?? []) {
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

// English anchors + Turkish sports desks (shared), plus a Google News query
// feed pair (EN + TR) per competition. These are mixed-sport master feeds; the
// team/star tag-match below drops anything that doesn't reference one of the
// competition's sides, so off-topic items fall away on their own. A dead feed
// only fails its own pull — runSoccerNewsIngest isolates each.
const SHARED_FEEDS: SoccerRssFeed[] = [
  { url: "https://www.espn.com/espn/rss/soccer/news", outlet: "ESPN", source: "rss:espnfc" },
  {
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    outlet: "BBC Sport",
    source: "rss:bbc",
  },
  {
    url: "https://www.theguardian.com/football/rss",
    outlet: "The Guardian",
    source: "rss:guardian",
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

const COMPETITION_FEEDS: Record<SoccerCompetition, SoccerRssFeed[]> = {
  "fifa.world": [
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
  ],
  "uefa.champions": [
    {
      url: "https://news.google.com/rss/search?q=%22Champions+League%22&hl=en-GB&gl=GB&ceid=GB:en",
      outlet: "Google News",
      source: "rss:gnews-ucl-en",
    },
    {
      url: "https://news.google.com/rss/search?q=%C5%9Eampiyonlar+Ligi&hl=tr&gl=TR&ceid=TR:tr",
      outlet: "Google Haberler",
      source: "rss:gnews-ucl-tr",
    },
  ],
  "uefa.europa": [
    {
      url: "https://news.google.com/rss/search?q=%22Europa+League%22&hl=en-GB&gl=GB&ceid=GB:en",
      outlet: "Google News",
      source: "rss:gnews-uel-en",
    },
    {
      url: "https://news.google.com/rss/search?q=%22Avrupa+Ligi%22&hl=tr&gl=TR&ceid=TR:tr",
      outlet: "Google Haberler",
      source: "rss:gnews-uel-tr",
    },
  ],
  "uefa.europa.conf": [
    {
      url: "https://news.google.com/rss/search?q=%22Conference+League%22&hl=en-GB&gl=GB&ceid=GB:en",
      outlet: "Google News",
      source: "rss:gnews-uecl-en",
    },
    {
      url: "https://news.google.com/rss/search?q=%22Konferans+Ligi%22&hl=tr&gl=TR&ceid=TR:tr",
      outlet: "Google Haberler",
      source: "rss:gnews-uecl-tr",
    },
  ],
};

export function soccerFeedsFor(competition: SoccerCompetition): SoccerRssFeed[] {
  return [...SHARED_FEEDS, ...COMPETITION_FEEDS[competition]];
}

export class SoccerRssNewsFetcher implements SoccerNewsFetcher {
  constructor(
    private feed: SoccerRssFeed,
    private competition: SoccerCompetition,
  ) {}

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

    const teams = await loadTeams(this.competition);
    const kind = COMPETITIONS[this.competition].kind;
    const out: SoccerNewsItem[] = [];

    for (const it of items) {
      const published = it.pubDate ? new Date(it.pubDate) : null;
      if (!published || Number.isNaN(published.getTime())) continue;
      if (published < since) continue;

      const text = `${it.title}. ${it.description}`;
      const tags = tagMentions(text, teams, kind);
      // Drop items that don't reference one of the competition's sides —
      // generic football (transfers, domestic leagues) isn't what this is for.
      if (tags.team_ids.length === 0) continue;

      const summary = trimToSentences(it.description || it.title, 3);
      if (!summary) continue;

      out.push({
        competition: this.competition,
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

export function soccerRssFetchers(
  competition: SoccerCompetition,
): SoccerNewsFetcher[] {
  return soccerFeedsFor(competition).map(
    (f) => new SoccerRssNewsFetcher(f, competition),
  );
}
