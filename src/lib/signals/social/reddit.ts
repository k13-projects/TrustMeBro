import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Signal, SignalFetcher } from "../types";

type RedditPost = {
  data: {
    id: string;
    title: string;
    selftext?: string;
    url: string;
    permalink: string;
    created_utc: number;
    score: number;
    num_comments: number;
  };
};

const POSITIVE = [
  /\bdominant\b/i,
  /\bbreakout\b/i,
  /\bcarrying\b/i,
  /\bcleared\b/i,
  /\breturn\b/i,
  /\bhealthy\b/i,
  /\bmonster game\b/i,
  /\btriple[ -]double\b/i,
];
const NEGATIVE = [
  /\binjury\b/i,
  /\bquestionable\b/i,
  /\bdoubtful\b/i,
  /\bejected\b/i,
  /\bsuspended\b/i,
  /\bout\b/i,
  /\bGTD\b/,
  /\bDNP\b/,
  /\bsprain\b/i,
  /\bstrain\b/i,
];

function scoreSentiment(text: string): number {
  let s = 0;
  for (const re of POSITIVE) if (re.test(text)) s += 0.5;
  for (const re of NEGATIVE) if (re.test(text)) s -= 0.7;
  return Math.max(-1, Math.min(1, s));
}

export class RedditNbaFetcher implements SignalFetcher {
  source = "social_reddit" as const;

  async fetch(since: Date): Promise<Signal[]> {
    const res = await fetch(
      "https://www.reddit.com/r/nba/new.json?limit=100",
      {
        headers: {
          "User-Agent":
            "TrustMeBro/0.1 (analytics; +https://github.com/k13-projects/TrustMeBro)",
        },
        next: { revalidate: 0 },
      },
    );
    if (!res.ok) {
      throw new Error(`reddit ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as {
      data: { children: RedditPost[] };
    };
    const posts = json.data?.children ?? [];

    const supabase = supabaseAdmin();
    const { data: playerRows } = await supabase
      .from("players")
      .select("id, first_name, last_name");
    type PlayerName = { id: number; first_name: string; last_name: string };
    const players = (playerRows ?? []) as PlayerName[];

    const out: Signal[] = [];
    for (const post of posts) {
      const created = new Date(post.data.created_utc * 1000);
      if (created < since) continue;

      const text = `${post.data.title} ${post.data.selftext ?? ""}`;
      const lowered = text.toLowerCase();

      const matchedPlayer = players.find((p) => {
        const last = p.last_name.toLowerCase();
        if (last.length < 4) return false;
        if (!lowered.includes(last)) return false;
        const first = p.first_name.toLowerCase();
        return first.length >= 3 ? lowered.includes(first) : true;
      });
      if (!matchedPlayer) continue;

      const sentiment = scoreSentiment(text);
      out.push({
        player_id: matchedPlayer.id,
        source: "social_reddit",
        source_url: `https://www.reddit.com${post.data.permalink}`,
        source_id: post.data.id,
        summary: post.data.title.slice(0, 280),
        sentiment,
        weight: 0.3,
        captured_at: new Date().toISOString(),
        occurred_at: created.toISOString(),
        raw: {
          score: post.data.score,
          num_comments: post.data.num_comments,
        },
      });
    }

    return out;
  }
}

export const redditFetcher = new RedditNbaFetcher();
