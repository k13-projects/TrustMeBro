import "server-only";

import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import { SOCCER_ODDS_SPORT_KEY } from "@/lib/sports/registry";
import type { RequestCredits } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";

// World Cup books are thickest in UK/EU. We request only the cheap bulk
// markets (h2h = 1X2, totals = O/U goals); BTTS is an "additional market" that
// needs the per-event endpoint + higher tier, deferred per the frugality note.
const SOCCER_MARKETS = ["h2h", "totals"] as const;
const REGIONS = "uk,eu";

export type SoccerOddsQuote = {
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  bookmaker: string;
  odds: number; // decimal
};

export type SoccerOddsEvent = {
  event_id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  quotes: SoccerOddsQuote[];
};

function getApiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    throw new Error(
      "ODDS_API_KEY is not set. Sign up at https://the-odds-api.com to get a key.",
    );
  }
  return key;
}

function readCredits(res: Response): RequestCredits {
  const num = (h: string | null) => (h ? Number(h) : null);
  return {
    requests_remaining: num(res.headers.get("x-requests-remaining")),
    requests_used: num(res.headers.get("x-requests-used")),
    requests_last: num(res.headers.get("x-requests-last")),
  };
}

type RawBulkEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    markets?: Array<{
      key: string;
      outcomes?: Array<{ name: string; price: number; point?: number }>;
    }>;
  }>;
};

function parseEvent(ev: RawBulkEvent): SoccerOddsEvent {
  const quotes: SoccerOddsQuote[] = [];
  for (const bm of ev.bookmakers ?? []) {
    for (const market of bm.markets ?? []) {
      for (const o of market.outcomes ?? []) {
        if (market.key === "h2h") {
          let side: MatchSide | null = null;
          if (o.name === ev.home_team) side = "home";
          else if (o.name === ev.away_team) side = "away";
          else if (o.name.toLowerCase() === "draw") side = "draw";
          if (!side) continue;
          quotes.push({
            market: "match_winner",
            side,
            line: null,
            bookmaker: bm.key,
            odds: o.price,
          });
        } else if (market.key === "totals") {
          const name = o.name.toLowerCase();
          if (name !== "over" && name !== "under") continue;
          if (typeof o.point !== "number") continue;
          quotes.push({
            market: "total_goals",
            side: name as MatchSide,
            line: o.point,
            bookmaker: bm.key,
            odds: o.price,
          });
        }
      }
    }
  }
  return {
    event_id: ev.id,
    commence_time: ev.commence_time,
    home_team: ev.home_team,
    away_team: ev.away_team,
    quotes,
  };
}

export async function fetchSoccerOdds(): Promise<{
  data: SoccerOddsEvent[];
  credits: RequestCredits;
}> {
  const url = new URL(`${BASE_URL}/sports/${SOCCER_ODDS_SPORT_KEY}/odds`);
  url.searchParams.set("apiKey", getApiKey());
  url.searchParams.set("regions", REGIONS);
  url.searchParams.set("markets", SOCCER_MARKETS.join(","));
  url.searchParams.set("oddsFormat", "decimal");

  const res = await fetch(url, { cache: "no-store" });
  const credits = readCredits(res);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `the-odds-api ${res.status} ${res.statusText} on soccer odds: ${body.slice(0, 200)}`,
    );
  }
  const raw = (await res.json()) as RawBulkEvent[];
  return { data: raw.map(parseEvent), credits };
}
