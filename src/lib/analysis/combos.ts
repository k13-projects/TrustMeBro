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
 * MVP rule: combine picks across different games only (independence
 * assumption holds when stat lines are uncorrelated). Same-game parlays
 * have correlation we don't model yet. Confidence math is naive
 * independence multiplication; the result is conservative because picks
 * within a slate aren't strictly independent (gametime affects multiple
 * players).
 */
export function generateCombos(
  predictions: Prediction[],
  opts: { minConfidence?: number; size?: number; max?: number; payouts?: PayoutMap } = {},
): Combo[] {
  const minConfidence = opts.minConfidence ?? 80;
  const size = opts.size ?? 2;
  const max = opts.max ?? 5;
  const payouts = opts.payouts ?? fallbackPayoutMap();
  const eligible = predictions.filter(
    (p) => p.confidence >= minConfidence,
  );
  if (eligible.length < size) return [];

  const combos: Combo[] = [];

  if (size === 2) {
    for (let i = 0; i < eligible.length; i++) {
      for (let j = i + 1; j < eligible.length; j++) {
        const a = eligible[i];
        const b = eligible[j];
        if (a.game_id === b.game_id) continue;
        const combined =
          Math.floor((a.confidence / 100) * (b.confidence / 100) * 1000) / 10;
        combos.push({
          picks: [a, b],
          combined_confidence: combined,
          power_payout: powerPayoutFrom(payouts, 2) ?? 0,
          flex_payout: flexPayoutFrom(payouts, 2) ?? 0,
        });
      }
    }
  }

  return combos
    .sort((a, b) => b.combined_confidence - a.combined_confidence)
    .slice(0, max);
}
