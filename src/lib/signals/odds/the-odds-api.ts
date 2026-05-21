import "server-only";

import type {
  FetchResult,
  OddsProvider,
  RawPlayerPropOutcome,
} from "./provider";
import type { OddsPlayerMarket, RawEvent, RequestCredits } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";
const SPORT_KEY = "basketball_nba";

// We request the *alternate* player-prop markets (the full line ladder), not
// the single main line. The engine bets deep lines away from the main number
// (see .claude/ENGINE_STRATEGY.md), so the ladder is what we need. Cost-neutral
// vs. the old main-line markets — 4 markets requested either way.
const PLAYER_PROP_MARKETS = [
  "player_points_alternate",
  "player_rebounds_alternate",
  "player_assists_alternate",
  "player_threes_alternate",
] as const;

// Map both the main and alternate market keys, so a response carrying either
// (some books fold the standard line into the alternate ladder) lands in the
// right prop bucket.
const MARKET_KEY_TO_PROP: Record<string, OddsPlayerMarket> = {
  player_points: "points",
  player_rebounds: "rebounds",
  player_assists: "assists",
  player_threes: "threes_made",
  player_points_alternate: "points",
  player_rebounds_alternate: "rebounds",
  player_assists_alternate: "assists",
  player_threes_alternate: "threes_made",
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

async function request<T>(
  path: string,
  query: Record<string, string | undefined> = {},
): Promise<FetchResult<T>> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("apiKey", getApiKey());
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  const res = await fetch(url, { cache: "no-store" });
  const credits = readCredits(res);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `the-odds-api ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as T;
  return { data, credits };
}

type RawEventResponse = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

type RawEventOddsResponse = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        description?: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
};

export class TheOddsApiProvider implements OddsProvider {
  async listEvents(): Promise<FetchResult<RawEvent[]>> {
    const { data, credits } = await request<RawEventResponse[]>(
      `/sports/${SPORT_KEY}/events`,
    );
    return {
      data: data.map((e) => ({
        id: e.id,
        commence_time: e.commence_time,
        home_team: e.home_team,
        away_team: e.away_team,
      })),
      credits,
    };
  }

  async listPlayerPropsForEvent(
    eventId: string,
  ): Promise<FetchResult<RawPlayerPropOutcome[]>> {
    const { data, credits } = await request<RawEventOddsResponse>(
      `/sports/${SPORT_KEY}/events/${eventId}/odds`,
      {
        regions: "us",
        markets: PLAYER_PROP_MARKETS.join(","),
        oddsFormat: "decimal",
      },
    );

    const outcomes: RawPlayerPropOutcome[] = [];
    for (const bm of data.bookmakers ?? []) {
      for (const market of bm.markets ?? []) {
        if (!(market.key in MARKET_KEY_TO_PROP)) continue;
        for (const o of market.outcomes ?? []) {
          const side = o.name.toLowerCase();
          if (side !== "over" && side !== "under") continue;
          if (typeof o.point !== "number" || !o.description) continue;
          outcomes.push({
            market_key: market.key,
            bookmaker_key: bm.key,
            player_name: o.description,
            line: o.point,
            side: side as "over" | "under",
            price_decimal: o.price,
          });
        }
      }
    }
    return { data: outcomes, credits };
  }
}

let _provider: OddsProvider | null = null;

export function theOddsApiProvider(): OddsProvider {
  if (!_provider) _provider = new TheOddsApiProvider();
  return _provider;
}

export { MARKET_KEY_TO_PROP };
