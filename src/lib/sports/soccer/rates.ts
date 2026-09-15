import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import { consensus, modalLine, SIDES } from "@/lib/analysis/soccer/engine";
import { outcomeKey } from "./coupon-legs";
import { loadLatestSoccerOdds } from "./repo";

// Per-outcome de-vigged rate for a market: the same consensus probability the
// engine reasons over, plus the best price across books. Surfaced for EVERY
// match (picked or not) so the "Rates" board can show win odds for every game.
export type RateOutcome = {
  side: MatchSide;
  prob: number; // 0..1 de-vigged consensus
  bestOdds: number | null; // best decimal across books
  // True only when a real soccer_predictions row exists for this exact
  // (match, market, side, line) — the small "our pick" marker, never a
  // selected state. Independent of `prob`/`isTop`: the engine's per-market
  // cap or dedup logic can skip a side that clears 50% on this board.
  isEnginePick: boolean;
};

// Every (match, market, side, line) the engine actually picked, across the
// given matches — regardless of a prediction's settlement status. Public-read
// table, so the plain SSR client is enough (no service role needed).
async function loadEnginePickedKeys(matchIds: number[]): Promise<Set<string>> {
  const keys = new Set<string>();
  if (matchIds.length === 0) return keys;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_predictions")
    .select("match_id, market, side, line")
    .in("match_id", matchIds);
  for (const p of data ?? []) {
    keys.add(
      outcomeKey(
        p.match_id as number,
        p.market as SoccerMarket,
        p.side as MatchSide,
        p.line === null ? null : Number(p.line),
      ),
    );
  }
  return keys;
}

export type MarketRates = {
  market: SoccerMarket;
  line: number | null;
  bookCount: number;
  outcomes: RateOutcome[];
};

// matchId → its priced markets, each with per-side rates. Markets with no
// complete book are omitted; matches with no odds map to an empty array.
export async function getSoccerRates(
  matchIds: number[],
): Promise<Map<number, MarketRates[]>> {
  const out = new Map<number, MarketRates[]>();
  if (matchIds.length === 0) return out;

  const [oddsByMatch, enginePicked] = await Promise.all([
    loadLatestSoccerOdds(matchIds),
    loadEnginePickedKeys(matchIds),
  ]);

  for (const matchId of matchIds) {
    const quotes = oddsByMatch.get(matchId) ?? [];
    const markets: MarketRates[] = [];

    for (const market of Object.keys(SIDES) as SoccerMarket[]) {
      const sides = SIDES[market];
      let marketQuotes = quotes.filter((q) => q.market === market);
      let line: number | null = null;

      if (market === "total_goals") {
        line = modalLine(marketQuotes);
        if (line === null) continue;
        marketQuotes = marketQuotes.filter((q) => q.line === line);
      }
      if (marketQuotes.length === 0) continue;

      const { prob, bestOdds, bookCount } = consensus(marketQuotes, sides);
      if (bookCount === 0) continue;

      markets.push({
        market,
        line,
        bookCount,
        outcomes: sides.map((side) => ({
          side,
          prob: prob.get(side) ?? 0,
          bestOdds: bestOdds.get(side)?.odds ?? null,
          isEnginePick: enginePicked.has(outcomeKey(matchId, market, side, line)),
        })),
      });
    }

    out.set(matchId, markets);
  }

  return out;
}
