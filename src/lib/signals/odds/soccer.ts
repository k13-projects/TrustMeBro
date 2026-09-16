import "server-only";

import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import { fetchEventOdds, type RawEventOddsResponse } from "./the-odds-api";
import type { RequestCredits } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";

// European club + national books are thickest in UK/EU. We request only the
// cheap bulk markets (h2h = 1X2, totals = O/U goals) here — the bulk endpoint
// 422s on anything else (verified live 2026-09-16, docs/handoffs/odds-markets-
// proposal_2026-09-16.md §1). One call = markets × regions = 4 credits.
const SOCCER_MARKETS = ["h2h", "totals"] as const;
const REGIONS = "uk,eu";

// BTTS only exists on the per-event endpoint (see fetchEventOdds), which is
// billed per match, not per competition. `uk` alone carried every book that
// quoted BTTS in the live check that shipped this (betfred_uk, leovegas,
// livescorebet, virginbet, williamhill, coral, ladbrokes_uk — all UK-market
// brands), so `eu` is skipped to keep this at 1 credit/match, not 2.
const BTTS_MARKETS = ["btts"] as const;
const BTTS_REGIONS = "uk";

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

// Bulk odds for one Odds-API sport key (e.g. soccer_uefa_champs_league).
export async function fetchSoccerOdds(sportKey: string): Promise<{
  data: SoccerOddsEvent[];
  credits: RequestCredits;
}> {
  const url = new URL(`${BASE_URL}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", getApiKey());
  url.searchParams.set("regions", REGIONS);
  url.searchParams.set("markets", SOCCER_MARKETS.join(","));
  url.searchParams.set("oddsFormat", "decimal");

  const res = await fetch(url, { cache: "no-store" });
  const credits = readCredits(res);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `the-odds-api ${res.status} ${res.statusText} on ${sportKey}: ${body.slice(0, 200)}`,
    );
  }
  const raw = (await res.json()) as RawBulkEvent[];
  return { data: raw.map(parseEvent), credits };
}

function parseBttsQuotes(ev: RawEventOddsResponse): SoccerOddsQuote[] {
  const quotes: SoccerOddsQuote[] = [];
  for (const bm of ev.bookmakers ?? []) {
    for (const market of bm.markets ?? []) {
      if (market.key !== "btts") continue;
      for (const o of market.outcomes ?? []) {
        const side = o.name.toLowerCase();
        if (side !== "yes" && side !== "no") continue;
        quotes.push({
          market: "btts",
          side: side as MatchSide,
          line: null,
          bookmaker: bm.key,
          odds: o.price,
        });
      }
    }
  }
  return quotes;
}

// Per-event BTTS pull for one already-resolved match. Billed per call
// (markets × regions = 1 credit at `uk`-only), unlike the bulk pull above —
// callers are responsible for only calling this once per match, ever (see
// loadMatchIdsWithBttsSnapshot in sports/soccer/repo.ts and the dedup gate in
// the track-odds cron). `eventId` is the same id The Odds API assigned the
// match in the bulk pull's response, so no extra `/events` list call is
// needed to find it.
export async function fetchBttsOddsForEvent(
  sportKey: string,
  eventId: string,
): Promise<{ quotes: SoccerOddsQuote[]; credits: RequestCredits }> {
  const { data, credits } = await fetchEventOdds(
    sportKey,
    eventId,
    [...BTTS_MARKETS],
    BTTS_REGIONS,
  );
  return { quotes: parseBttsQuotes(data), credits };
}
