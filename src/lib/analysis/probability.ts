import type { PlayerFeatures, PickSide, PropMarket } from "./types";

// Phase 2 of the engine win-rate pivot (see .claude/ENGINE_STRATEGY.md).
//
// The old confidence number was an *agreement score* — "how many of my 6 stat
// windows sit on the pick side" — which is not a probability. This module
// returns an honest P(clear the line) from the player's recent distribution,
// so the engine can pick the genuinely higher-probability side and surface a
// number that means what it says (after the calibration layer maps raw → real).

// Standard normal CDF via the Abramowitz-Stegun 7.1.26 erf approximation
// (abs error < 1.5e-7). Pure, no deps.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Volatility floors per market. A player on a tight recent run can show a near-
// zero stdev (24, 25, 24, 26) which would otherwise imply ~99% certainty — the
// floor keeps the raw probability sane before calibration. Tuned to typical
// game-to-game spread for each stat.
const SIGMA_FLOOR: Record<PropMarket, number> = {
  points: 4,
  rebounds: 2,
  assists: 1.6,
  threes_made: 1,
  pra: 5.5,
  minutes: 4,
  steals: 1,
  blocks: 1,
};

export type MarketProbability = {
  projection: number;
  sigma: number;
  p_over: number;
  p_under: number;
  best_side: PickSide;
  best_p: number;
};

/**
 * P(stat clears the line) for both sides, from the player's recent windows.
 *
 * mean = recency-weighted blend (L5 heaviest), reweighted over whichever
 * windows actually have data so an empty window can't drag the mean to 0.
 * sigma = recent volatility (L10 → season → market floor), floored.
 */
export function marketProbability(
  features: PlayerFeatures,
  line: number,
  isHome: boolean,
): MarketProbability {
  const homeAway = isHome ? features.home : features.away;

  const parts: Array<{ mean: number; weight: number; count: number }> = [
    { mean: features.last5.mean, weight: 0.45, count: features.last5.count },
    { mean: features.last10.mean, weight: 0.25, count: features.last10.count },
    { mean: features.season.mean, weight: 0.15, count: features.season.count },
    { mean: homeAway.mean, weight: 0.15, count: homeAway.count },
  ];
  let wsum = 0;
  let acc = 0;
  for (const p of parts) {
    if (p.count <= 0) continue;
    acc += p.mean * p.weight;
    wsum += p.weight;
  }
  const projection = wsum > 0 ? acc / wsum : features.season.mean;

  const rawSigma =
    features.last10.stdev > 0
      ? features.last10.stdev
      : features.season.stdev > 0
        ? features.season.stdev
        : 0;
  const floor = SIGMA_FLOOR[features.market] ?? 3;
  const sigma = Math.max(rawSigma, floor);

  // Half-point lines (X.5) mean no push. P(value > line) under a Normal
  // centred on the projection.
  const pOver = normalCdf((projection - line) / sigma);
  const pUnder = 1 - pOver;

  const best_side: PickSide = pOver >= pUnder ? "over" : "under";
  return {
    projection,
    sigma,
    p_over: pOver,
    p_under: pUnder,
    best_side,
    best_p: Math.max(pOver, pUnder),
  };
}
