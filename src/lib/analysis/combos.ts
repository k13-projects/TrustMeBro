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
 *
 * Caps:
 *  - Per-size cap of 1000 candidates explored — protects against quadratic
 *    blow-up when the eligible pool is large (a 60-pick eligible pool
 *    yields ~34k 3-pick triples).
 */
export function generateCombos(
  predictions: Prediction[],
  opts: { minConfidence?: number; size?: number; max?: number; payouts?: PayoutMap } = {},
): Combo[] {
  const minConfidence = opts.minConfidence ?? 60;
  const size = opts.size ?? 2;
  const max = opts.max ?? 5;
  const payouts = opts.payouts ?? fallbackPayoutMap();

  const eligible = predictions
    .filter((p) => p.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
  if (eligible.length < size) return [];

  // Greedy candidate cap: only the top-N most confident picks feed the
  // combinatorial search. For size=2 we can afford the whole pool; for
  // size=3 we slice to the top 24 (≈2k triples worst case).
  const poolSize = size === 3 ? 24 : eligible.length;
  const pool = eligible.slice(0, poolSize);

  const powerMult = powerPayoutFrom(payouts, size) ?? 0;
  const flexMult = flexPayoutFrom(payouts, size) ?? 0;
  const combos: Combo[] = [];

  if (size === 2) {
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i];
        const b = pool[j];
        if (a.player_id === b.player_id) continue;
        const combined =
          Math.floor((a.confidence / 100) * (b.confidence / 100) * 1000) / 10;
        combos.push({
          picks: [a, b],
          combined_confidence: combined,
          power_payout: powerMult,
          flex_payout: flexMult,
        });
      }
    }
  } else if (size === 3) {
    for (let i = 0; i < pool.length; i++) {
      const a = pool[i];
      for (let j = i + 1; j < pool.length; j++) {
        const b = pool[j];
        if (a.player_id === b.player_id) continue;
        for (let k = j + 1; k < pool.length; k++) {
          const c = pool[k];
          if (c.player_id === a.player_id || c.player_id === b.player_id) continue;
          const combined =
            Math.floor(
              (a.confidence / 100) *
                (b.confidence / 100) *
                (c.confidence / 100) *
                1000,
            ) / 10;
          combos.push({
            picks: [a, b, c],
            combined_confidence: combined,
            power_payout: powerMult,
            flex_payout: flexMult,
          });
        }
      }
    }
  } else {
    // Other sizes intentionally unsupported — covered by the UI's 2× / 3×
    // sections. Add a new branch here when 4-pick or larger flex coupons
    // become a homepage surface.
    return [];
  }

  return combos
    .sort((a, b) => b.combined_confidence - a.combined_confidence)
    .slice(0, max);
}
