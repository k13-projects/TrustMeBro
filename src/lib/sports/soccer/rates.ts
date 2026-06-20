import "server-only";

import type { MatchSide, SoccerMarket } from "@/lib/sports/types";
import { consensus, modalLine, SIDES } from "@/lib/analysis/soccer/engine";
import { loadLatestSoccerOdds } from "./repo";

// Per-outcome de-vigged rate for a market: the same consensus probability the
// engine reasons over, plus the best price across books. Surfaced for EVERY
// match (picked or not) so the "Rates" board can show win odds for every game.
export type RateOutcome = {
  side: MatchSide;
  prob: number; // 0..1 de-vigged consensus
  bestOdds: number | null; // best decimal across books
};

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

  const oddsByMatch = await loadLatestSoccerOdds(matchIds);

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
        })),
      });
    }

    out.set(matchId, markets);
  }

  return out;
}
