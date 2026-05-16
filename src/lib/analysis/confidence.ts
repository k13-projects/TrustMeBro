import type {
  ConfidenceCheck,
  PickSide,
  PlayerFeatures,
  Reasoning,
  SignalImpact,
} from "./types";

type ScoreInput = {
  features: PlayerFeatures;
  line: number;
  pick: PickSide;
  is_home: boolean;
  signals?: SignalImpact[];
};

type ScoreOutput = {
  confidence: number;
  projection: number;
  reasoning: Reasoning;
};

const WEIGHTS = {
  season: 0.15,
  last10: 0.25,
  last5: 0.3,
  home_away: 0.15,
  vs_opponent: 0.1,
  last_game: 0.05,
} as const;

// Confidence is clamped to [10, 95]. 100 implies certainty — we never have
// that. 0 implies negative information — we never have that either. Reserving
// the top of the range for picks that are *also* wide-margin and well-sampled
// means a high confidence number actually means something the user can lean on.
const CONFIDENCE_FLOOR = 10;
const CONFIDENCE_CAP = 95;

// Margin penalty: a pick that beats the line by a fraction of a stdev is more
// fragile than one that beats it by multiple stdevs. We map the per-check
// (windowMean − line) distance into stdev units, average across checks that
// carry meaningful weight, and dock up to this many points when every check
// barely clears.
const MAX_MARGIN_PENALTY = 20;
const MARGIN_FULL_CREDIT_STDEVS = 2;

// Sample-size penalty: predictions built on 5 games are riskier than on 25.
// Combine last10 + season counts as the sample signal.
const MAX_SAMPLE_PENALTY = 15;
const SAMPLE_FULL_CREDIT = 25;

// Per-check weights below this threshold are excluded from margin scoring —
// the "Last game" check (weight 0.05) is a single data point and is too noisy
// to anchor a margin estimate against.
const MIN_WEIGHT_FOR_MARGIN = 0.1;

function checkWindow(
  label: string,
  windowMean: number,
  line: number,
  pick: PickSide,
  weight: number,
  count: number,
): ConfidenceCheck {
  if (count === 0) {
    return { label, passed: false, value: 0, target: line, weight: 0 };
  }
  const passed = pick === "over" ? windowMean > line : windowMean < line;
  return { label, passed, value: windowMean, target: line, weight };
}

export function scorePrediction(input: ScoreInput): ScoreOutput {
  const { features, line, pick, is_home, signals = [] } = input;
  const homeAway = is_home ? features.home : features.away;
  const homeAwayLabel = is_home ? "Home avg" : "Away avg";

  const checks: ConfidenceCheck[] = [
    checkWindow(
      "Season avg",
      features.season.mean,
      line,
      pick,
      WEIGHTS.season,
      features.season.count,
    ),
    checkWindow(
      "Last 10 avg",
      features.last10.mean,
      line,
      pick,
      WEIGHTS.last10,
      features.last10.count,
    ),
    checkWindow(
      "Last 5 avg",
      features.last5.mean,
      line,
      pick,
      WEIGHTS.last5,
      features.last5.count,
    ),
    checkWindow(
      homeAwayLabel,
      homeAway.mean,
      line,
      pick,
      WEIGHTS.home_away,
      homeAway.count,
    ),
    checkWindow(
      "Vs. opponent",
      features.vs_opponent.mean,
      line,
      pick,
      WEIGHTS.vs_opponent,
      features.vs_opponent.count,
    ),
    checkWindow(
      "Last game",
      features.last_game_value ?? 0,
      line,
      pick,
      WEIGHTS.last_game,
      features.last_game_value === null ? 0 : 1,
    ),
  ];

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const passedWeight = checks.reduce(
    (s, c) => s + (c.passed ? c.weight : 0),
    0,
  );
  const base = (passedWeight / totalWeight) * 100;

  // Volatility anchor: use last10 stdev if we have it, fall back to season,
  // then to 1 as a no-op divisor. A stdev of 0 would collapse the margin
  // calc; treat it as 1 to avoid Infinity.
  const stdev =
    features.last10.stdev > 0
      ? features.last10.stdev
      : features.season.stdev > 0
        ? features.season.stdev
        : 1;

  // Margin factor — average per-check distance from the line in stdev units,
  // weighted by check weight. 0 = every check barely clears, 1 = every check
  // is at least MARGIN_FULL_CREDIT_STDEVS away.
  let marginWeight = 0;
  let marginAcc = 0;
  for (const c of checks) {
    if (c.weight < MIN_WEIGHT_FOR_MARGIN || c.weight === 0) continue;
    const distance = Math.abs(c.value - line) / stdev;
    const score = Math.min(distance / MARGIN_FULL_CREDIT_STDEVS, 1);
    marginAcc += c.weight * score;
    marginWeight += c.weight;
  }
  const marginFactor = marginWeight > 0 ? marginAcc / marginWeight : 0;
  const marginPenalty = (1 - marginFactor) * MAX_MARGIN_PENALTY;

  // Sample-size factor — combine recent and season counts. The recency-weighted
  // sum penalises both "rookie with 3 games" and "vet who hasn't played in a
  // month" scenarios.
  const sampleSize = features.last10.count + features.season.count;
  const sampleFactor = Math.min(sampleSize / SAMPLE_FULL_CREDIT, 1);
  const samplePenalty = (1 - sampleFactor) * MAX_SAMPLE_PENALTY;

  // Cap signal contribution at +/-10 points so patterns + news can't shove
  // every pick into 90+. Important once patterns wire in at generation time.
  let signalDelta = 0;
  for (const sig of signals) {
    signalDelta += sig.impact * 5;
  }
  signalDelta = Math.max(-10, Math.min(10, signalDelta));

  let confidence = base - marginPenalty - samplePenalty + signalDelta;
  confidence = Math.max(CONFIDENCE_FLOOR, Math.min(CONFIDENCE_CAP, confidence));

  const projection =
    features.last5.mean * 0.45 +
    features.last10.mean * 0.25 +
    features.season.mean * 0.15 +
    homeAway.mean * 0.15;

  // Surface why confidence isn't 100. weight 0 = informational only, doesn't
  // round-trip into the score (we already applied the penalty).
  const enrichedChecks: ConfidenceCheck[] = [
    ...checks,
    {
      label: "Margin (vs L10 stdev)",
      passed: marginFactor >= 0.6,
      value: Math.round(marginFactor * 100) / 100,
      target: 1,
      weight: 0,
    },
    {
      label: "Sample depth",
      passed: sampleFactor >= 0.6,
      value: sampleSize,
      target: SAMPLE_FULL_CREDIT,
      weight: 0,
    },
  ];

  return {
    confidence: Math.round(confidence * 10) / 10,
    projection: Math.round(projection * 10) / 10,
    reasoning: { checks: enrichedChecks, signals },
  };
}
