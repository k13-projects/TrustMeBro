import type { Reasoning } from "@/lib/analysis/types";
import type { MatchSide, SoccerMarket } from "@/lib/sports/types";

// Pure soccer engine: turns bookmaker odds (+ optional table form) into picks.
// Confidence is the de-vigged consensus probability across books, lightly
// nudged by standings form. No DB, no fetch — inputs are injected.

export type EngineQuote = {
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  bookmaker: string;
  odds: number; // decimal
};

export type TeamForm = {
  points: number;
  goal_diff: number;
  played: number;
} | null;

export type MatchEngineInput = {
  match_id: number;
  home_form: TeamForm;
  away_form: TeamForm;
  quotes: EngineQuote[];
};

export type SoccerPrediction = {
  match_id: number;
  market: SoccerMarket;
  side: MatchSide;
  line: number | null;
  probability: number; // 0..1 de-vigged consensus, after form nudge
  confidence: number; // 0..100
  best_odds: number; // best decimal price across books
  bookmaker: string | null;
  expected_value: number | null;
  reasoning: Reasoning;
  is_banko: boolean;
};

const SIDES: Record<SoccerMarket, MatchSide[]> = {
  match_winner: ["home", "draw", "away"],
  total_goals: ["over", "under"],
  btts: ["yes", "no"],
};

// Cap on how far table form may move a probability (percentage points).
const MAX_FORM_NUDGE = 0.04;

function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// Most common totals line across books (consensus). Ties → lower line.
function modalLine(quotes: EngineQuote[]): number | null {
  const counts = new Map<number, number>();
  for (const q of quotes) {
    if (q.line === null) continue;
    counts.set(q.line, (counts.get(q.line) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  for (const [line, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && line < best)) {
      best = line;
      bestCount = count;
    }
  }
  return best;
}

// De-vig a single market at a single line: per book, normalize 1/odds across
// the market's sides to remove the overround, then average across books.
function consensus(
  quotes: EngineQuote[],
  sides: MatchSide[],
): {
  prob: Map<MatchSide, number>;
  bestOdds: Map<MatchSide, { odds: number; bookmaker: string }>;
  bookCount: number;
} {
  const byBook = new Map<string, Map<MatchSide, number>>();
  const bestOdds = new Map<MatchSide, { odds: number; bookmaker: string }>();

  for (const q of quotes) {
    if (!sides.includes(q.side)) continue;
    if (!byBook.has(q.bookmaker)) byBook.set(q.bookmaker, new Map());
    byBook.get(q.bookmaker)!.set(q.side, q.odds);
    const cur = bestOdds.get(q.side);
    if (!cur || q.odds > cur.odds) {
      bestOdds.set(q.side, { odds: q.odds, bookmaker: q.bookmaker });
    }
  }

  const sums = new Map<MatchSide, number>();
  let books = 0;
  for (const sideOdds of byBook.values()) {
    // Only de-vig books that priced the complete market.
    if (!sides.every((s) => sideOdds.has(s))) continue;
    const raw = sides.map((s) => 1 / sideOdds.get(s)!);
    const overround = raw.reduce((a, b) => a + b, 0);
    sides.forEach((s, i) => {
      sums.set(s, (sums.get(s) ?? 0) + raw[i] / overround);
    });
    books += 1;
  }

  const prob = new Map<MatchSide, number>();
  if (books > 0) {
    for (const s of sides) prob.set(s, (sums.get(s) ?? 0) / books);
  }
  return { prob, bestOdds, bookCount: books };
}

// Signed form edge in [-1, 1], positive favors home. Driven by table points
// and goal difference; null forms ⇒ no edge.
function formEdge(home: TeamForm, away: TeamForm): number {
  if (!home || !away) return 0;
  const pts = (home.points - away.points) / 9; // ~3 wins of separation = full
  const gd = (home.goal_diff - away.goal_diff) / 8;
  return Math.max(-1, Math.min(1, pts * 0.6 + gd * 0.4));
}

function buildReasoning(
  prob: number,
  bookCount: number,
  edge: number,
  edgeApplies: boolean,
): Reasoning {
  const checks = [
    {
      label: "De-vigged consensus probability",
      passed: prob >= 0.5,
      value: round(prob * 100, 1),
      target: 50,
      weight: 0.7,
    },
    {
      label: "Bookmaker agreement",
      passed: bookCount >= 3,
      value: bookCount,
      target: 3,
      weight: 0.2,
    },
  ];
  const signals = [];
  if (edgeApplies && Math.abs(edge) > 0.01) {
    checks.push({
      label: "Table form edge",
      passed: edge > 0,
      value: round(edge, 2),
      target: 0,
      weight: 0.1,
    });
    signals.push({
      source: "standings",
      impact: round(edge, 2),
      note:
        edge > 0
          ? "League table favors the home side"
          : "League table favors the away side",
    });
  }
  return { checks, signals };
}

// Produce one prediction per priced side of every market for a single match.
export function predictMatch(input: MatchEngineInput): SoccerPrediction[] {
  const out: SoccerPrediction[] = [];
  const edge = formEdge(input.home_form, input.away_form);

  for (const market of Object.keys(SIDES) as SoccerMarket[]) {
    const sides = SIDES[market];
    let marketQuotes = input.quotes.filter((q) => q.market === market);
    let line: number | null = null;

    if (market === "total_goals") {
      line = modalLine(marketQuotes);
      if (line === null) continue;
      marketQuotes = marketQuotes.filter((q) => q.line === line);
    }
    if (marketQuotes.length === 0) continue;

    const { prob, bestOdds, bookCount } = consensus(marketQuotes, sides);
    if (bookCount === 0) continue;

    for (const side of sides) {
      const base = prob.get(side);
      const best = bestOdds.get(side);
      if (base === undefined || !best) continue;

      // Form nudge only applies to the match result market.
      let p = base;
      let edgeApplies = false;
      if (market === "match_winner" && (side === "home" || side === "away")) {
        const dir = side === "home" ? 1 : -1;
        p = Math.max(0.01, Math.min(0.99, base + dir * edge * MAX_FORM_NUDGE));
        edgeApplies = true;
      }

      const ev = p * best.odds - 1;
      out.push({
        match_id: input.match_id,
        market,
        side,
        line,
        probability: round(p, 4),
        confidence: round(p * 100, 1),
        best_odds: best.odds,
        bookmaker: best.bookmaker,
        expected_value: round(ev, 4),
        reasoning: buildReasoning(p, bookCount, edge, edgeApplies),
        is_banko: false,
      });
    }
  }

  return out;
}
