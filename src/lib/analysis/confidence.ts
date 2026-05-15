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
  let confidence = (passedWeight / totalWeight) * 100;

  for (const sig of signals) {
    confidence += sig.impact * 5;
  }
  confidence = Math.max(0, Math.min(100, confidence));

  const projection =
    features.last5.mean * 0.45 +
    features.last10.mean * 0.25 +
    features.season.mean * 0.15 +
    homeAway.mean * 0.15;

  return {
    confidence: Math.round(confidence * 10) / 10,
    projection: Math.round(projection * 10) / 10,
    reasoning: { checks, signals },
  };
}
