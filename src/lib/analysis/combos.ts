import type { Prediction } from "./types";
import { fallbackPayoutMap, powerPayoutFrom, flexPayoutFrom, type PayoutMap } from "./payouts";

export type Combo = {
  picks: Prediction[];
  combined_confidence: number;
  power_payout: number;
  flex_payout: number;
};

export function powerPayout(picks: number, map: PayoutMap = fallbackPayoutMap()): number | null {
  return powerPayoutFrom(map, picks);
}

export function flexPayout(picks: number, map: PayoutMap = fallbackPayoutMap()): number | null {
  return flexPayoutFrom(map, picks);
}

// Pool caps per combo size. The combinatorial blow-up is the reason: at
// size=6 a pool of 20 is 20C6 ≈ 38k iterations before player-dedup, so
// we tighten the pool aggressively as size grows.
const POOL_CAP_BY_SIZE: Record<number, number> = {
  2: Infinity,
  3: 24,
  4: 18,
  5: 14,
  6: 12,
};

/**
 * Generate top combos from the slate.
 *
 * Rules:
 *  - One pick per player (rules out same-player "points OVER 20" + "rebounds
 *    OVER 5" twins that would otherwise dominate the top combos).
 *  - Confidence floor (default 60) keeps the most speculative picks out
 *    without strangling small slates.
 *
 * Same-game picks are allowed — we used to require different games but on
 * single-game slates that left the combo sections empty. The combined-
 * confidence math is naive-independence (product of probabilities); for
 * same-game picks that's slightly optimistic since the picks are correlated.
 *
 * Combined confidence is naive-independence: product of pick probabilities.
 * Slightly conservative across different games; slightly optimistic within
 * the same game.
 */
export function generateCombos(
  predictions: Prediction[],
  opts: { minConfidence?: number; size?: number; max?: number; payouts?: PayoutMap } = {},
): Combo[] {
  const minConfidence = opts.minConfidence ?? 60;
  const size = opts.size ?? 2;
  const max = opts.max ?? 5;
  const payouts = opts.payouts ?? fallbackPayoutMap();

  if (size < 2 || size > 6) return [];

  const eligible = predictions
    .filter((p) => p.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
  if (eligible.length < size) return [];

  const cap = POOL_CAP_BY_SIZE[size] ?? eligible.length;
  const pool = eligible.slice(0, Math.min(cap, eligible.length));

  const powerMult = powerPayoutFrom(payouts, size) ?? 0;
  const flexMult = flexPayoutFrom(payouts, size) ?? 0;
  const combos: Combo[] = [];

  const current: Prediction[] = [];
  const usedPlayers = new Set<number>();
  const recurse = (start: number) => {
    if (current.length === size) {
      let prob = 1;
      for (const p of current) prob *= p.confidence / 100;
      combos.push({
        picks: [...current],
        combined_confidence: Math.floor(prob * 1000) / 10,
        power_payout: powerMult,
        flex_payout: flexMult,
      });
      return;
    }
    const need = size - current.length;
    for (let i = start; i <= pool.length - need; i++) {
      const pick = pool[i];
      if (usedPlayers.has(pick.player_id)) continue;
      current.push(pick);
      usedPlayers.add(pick.player_id);
      recurse(i + 1);
      current.pop();
      usedPlayers.delete(pick.player_id);
    }
  };
  recurse(0);

  return combos
    .sort((a, b) => b.combined_confidence - a.combined_confidence)
    .slice(0, max);
}
