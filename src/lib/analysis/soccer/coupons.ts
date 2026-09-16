import type { SoccerPrediction } from "./engine";

// Turns the day's soccer predictions into the showcase surfaces:
//   • BANKO   — the most-trusted single picks (short-odds favorites)
//   • multiplier coupons — parlays built to hit 2× / 3× / 5× / 10×
//   • surprise — a longshot stack for a big payout ("win huge")

export type CouponKind = "banko" | "multiplier" | "surprise";

export type EngineCoupon = {
  kind: CouponKind;
  target_multiplier: number | null;
  legs: SoccerPrediction[];
  combined_odds: number;
  combined_probability: number;
};

export type CouponBundle = {
  banko: SoccerPrediction[];
  coupons: EngineCoupon[];
};

export const MULTIPLIER_TARGETS = [2, 3, 5, 10] as const;
const SURPRISE_TARGET = 20;
const SURPRISE_MAX_LEGS = 6;
const BANKO_COUNT = 5;
const BANKO_MIN_CONFIDENCE = 60;

const product = (xs: number[]) => xs.reduce((a, b) => a * b, 1);

function byConfidenceDesc(a: SoccerPrediction, b: SoccerPrediction) {
  return b.confidence - a.confidence;
}

// Pick the engine's most-trusted singles: highest-confidence favorites, one
// per match, above a confidence floor.
export function selectBanko(predictions: SoccerPrediction[]): SoccerPrediction[] {
  const seen = new Set<number>();
  const out: SoccerPrediction[] = [];
  for (const p of [...predictions].sort(byConfidenceDesc)) {
    if (p.confidence < BANKO_MIN_CONFIDENCE) break;
    if (seen.has(p.match_id)) continue;
    seen.add(p.match_id);
    out.push({ ...p, is_banko: true });
    if (out.length >= BANKO_COUNT) break;
  }
  return out;
}

// Build the *likeliest* parlay that still pays the target multiplier: take the
// highest-confidence legs (one per match) until the combined odds clear T,
// with a minimum of two legs so it reads as a coupon.
function buildMultiplierCoupon(
  candidates: SoccerPrediction[],
  target: number,
): EngineCoupon | null {
  const seen = new Set<number>();
  const legs: SoccerPrediction[] = [];
  for (const p of candidates) {
    if (seen.has(p.match_id)) continue;
    seen.add(p.match_id);
    legs.push(p);
    if (product(legs.map((l) => l.best_odds)) >= target && legs.length >= 2) {
      break;
    }
  }
  const odds = product(legs.map((l) => l.best_odds));
  if (legs.length < 2 || odds < target) return null;
  return {
    kind: "multiplier",
    target_multiplier: target,
    legs,
    combined_odds: Math.round(odds * 100) / 100,
    combined_probability: Math.round(product(legs.map((l) => l.probability)) * 10000) / 10000,
  };
}

// Stack value longshots (positive EV, longer prices) toward a big multiplier.
function buildSurpriseCoupon(predictions: SoccerPrediction[]): EngineCoupon | null {
  const candidates = predictions
    .filter((p) => p.best_odds >= 2.2 && (p.expected_value ?? -1) >= 0)
    .sort((a, b) => (b.expected_value ?? 0) - (a.expected_value ?? 0));

  const seen = new Set<number>();
  const legs: SoccerPrediction[] = [];
  for (const p of candidates) {
    if (seen.has(p.match_id)) continue;
    seen.add(p.match_id);
    legs.push(p);
    if (product(legs.map((l) => l.best_odds)) >= SURPRISE_TARGET) break;
    if (legs.length >= SURPRISE_MAX_LEGS) break;
  }
  const odds = product(legs.map((l) => l.best_odds));
  if (legs.length < 3 || odds < SURPRISE_TARGET) return null;
  return {
    kind: "surprise",
    target_multiplier: null,
    legs,
    combined_odds: Math.round(odds * 100) / 100,
    combined_probability: Math.round(product(legs.map((l) => l.probability)) * 10000) / 10000,
  };
}

// Coupons are built from banko legs only (2026-09-16). Graded record: World
// Cup engine coupons went 8W-2L, Champions League went 0W-3L — the
// difference was leg quality, and a parlay is only as strong as its weakest
// leg. `selectBanko` already returns at most one leg per match
// (BANKO_MIN_CONFIDENCE floor, sorted by confidence desc, capped at
// BANKO_COUNT), and both coupon builders below already require >=2 (or >=3
// for the surprise stack) legs before returning anything — so a matchday
// with fewer than 2 banko legs naturally produces no coupon, not a special
// case to add. One consequence worth noting: the surprise coupon targets
// long prices (best_odds >= 2.2) and banko legs are, by construction, the
// engine's shortest-priced favorites, so it will rarely — possibly never —
// find enough legs to fire under this rule. That is accepted, not a bug:
// stacking longshots we don't trust at banko level is exactly the kind of
// volume this pivot retires.
export function buildCoupons(predictions: SoccerPrediction[]): CouponBundle {
  const banko = selectBanko(predictions);

  const coupons: EngineCoupon[] = [];
  for (const target of MULTIPLIER_TARGETS) {
    const coupon = buildMultiplierCoupon(banko, target);
    if (coupon) coupons.push(coupon);
  }

  const surprise = buildSurpriseCoupon(banko);
  if (surprise) coupons.push(surprise);

  return { banko, coupons };
}
