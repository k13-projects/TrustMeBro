import { marketProbability } from "./probability";
import { calibrate, rawForCalibrated } from "./calibration";
import type { PlayerFeatures, PickSide } from "./types";

// Phase 2/4: deep alt-line selection (see .claude/ENGINE_STRATEGY.md).
// Backtest proved main lines top out at ~53% but deep alt lines calibrate to
// 75-85%. This picks, from a book's alt-line ladder, the SHALLOWEST line that
// still clears the target win rate — i.e. the least-juiced line that's still a
// genuine ~target% lock. No qualifying line ⇒ no pick (selectivity by design).

export type LadderQuote = {
  line: number;
  side: PickSide;
  price_decimal: number;
  bookmaker: string;
};

export type AltLinePick = {
  side: PickSide;
  line: number;
  price_decimal: number;
  bookmaker: string;
  projection: number;
  prob_raw: number; // raw model P(clear), 0..1
  prob_calibrated: number; // empirically-corrected hit rate, 0..1 (shown as confidence)
};

export function selectAltLinePick(args: {
  ladder: LadderQuote[];
  features: PlayerFeatures;
  isHome: boolean;
  targetWinRate: number; // e.g. 0.85
}): AltLinePick | null {
  const { ladder, features, isHome, targetWinRate } = args;
  const rawNeeded = rawForCalibrated(targetWinRate);

  // Collapse to the best price per (side, line).
  const bestByLineSide = new Map<string, LadderQuote>();
  for (const q of ladder) {
    const k = `${q.side}:${q.line}`;
    const cur = bestByLineSide.get(k);
    if (!cur || q.price_decimal > cur.price_decimal) bestByLineSide.set(k, q);
  }

  let best: AltLinePick | null = null;
  for (const q of bestByLineSide.values()) {
    const mp = marketProbability(features, q.line, isHome);
    const rawP = q.side === "over" ? mp.p_over : mp.p_under;
    if (rawP < rawNeeded) continue;
    // Shallowest qualifying line = smallest rawP still ≥ threshold = closest to
    // target = best price. Prefer it.
    if (best === null || rawP < best.prob_raw) {
      best = {
        side: q.side,
        line: q.line,
        price_decimal: q.price_decimal,
        bookmaker: q.bookmaker,
        projection: mp.projection,
        prob_raw: rawP,
        prob_calibrated: calibrate(rawP),
      };
    }
  }
  return best;
}
