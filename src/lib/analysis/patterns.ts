import type { PlayerGameStatLine, PropMarket } from "./types";
import { MARKET_TO_FIELD } from "./market-field";

export type DetectedPattern = {
  pattern_type: "cycle" | "home_away_split" | "rest_day_dip" | "cold_streak";
  market: PropMarket;
  description: string;
  confidence: number;
  evidence: Record<string, unknown>;
};

function values(history: PlayerGameStatLine[], market: PropMarket): number[] {
  const field = MARKET_TO_FIELD[market];
  return history
    .map((g) => g[field])
    .filter((v): v is number => typeof v === "number");
}

/**
 * Detect: home vs away mean diverges meaningfully (>20% of overall mean).
 */
export function detectHomeAwaySplit(
  history: PlayerGameStatLine[],
  market: PropMarket,
): DetectedPattern | null {
  const home = values(
    history.filter((g) => g.is_home),
    market,
  );
  const away = values(
    history.filter((g) => !g.is_home),
    market,
  );
  if (home.length < 5 || away.length < 5) return null;

  const homeMean = home.reduce((s, v) => s + v, 0) / home.length;
  const awayMean = away.reduce((s, v) => s + v, 0) / away.length;
  const overall = (homeMean + awayMean) / 2;
  if (overall === 0) return null;

  const diff = Math.abs(homeMean - awayMean) / overall;
  if (diff < 0.2) return null;

  const better = homeMean > awayMean ? "home" : "away";
  return {
    pattern_type: "home_away_split",
    market,
    description: `Plays meaningfully better at ${better} (${(diff * 100).toFixed(0)}% gap).`,
    confidence: Math.min(1, diff),
    evidence: { home_mean: homeMean, away_mean: awayMean, gap: diff },
  };
}

/**
 * Detect: last 3 games all below L10 mean — cold streak.
 */
export function detectColdStreak(
  history: PlayerGameStatLine[],
  market: PropMarket,
): DetectedPattern | null {
  const all = values(history, market);
  if (all.length < 10) return null;
  const last3 = values(history.slice(0, 3), market);
  if (last3.length < 3) return null;
  const ref = values(history.slice(3, 13), market);
  if (ref.length === 0) return null;
  const refMean = ref.reduce((s, v) => s + v, 0) / ref.length;
  if (last3.every((v) => v < refMean * 0.85)) {
    return {
      pattern_type: "cold_streak",
      market,
      description: `Last 3 games all >15% below recent baseline (${refMean.toFixed(1)}).`,
      confidence: 0.7,
      evidence: { last3, baseline: refMean },
    };
  }
  return null;
}

export function detectAll(
  history: PlayerGameStatLine[],
  market: PropMarket,
): DetectedPattern[] {
  return [
    detectHomeAwaySplit(history, market),
    detectColdStreak(history, market),
  ].filter((p): p is DetectedPattern => p !== null);
}
