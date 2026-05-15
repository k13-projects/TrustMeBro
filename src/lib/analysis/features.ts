import type {
  FeatureWindow,
  PlayerFeatures,
  PlayerGameStatLine,
  PropMarket,
} from "./types";
import { statValue } from "./market-field";

const EMPTY: FeatureWindow = {
  count: 0,
  mean: 0,
  median: 0,
  stdev: 0,
  min: 0,
  max: 0,
};

function extractValues(
  history: PlayerGameStatLine[],
  market: PropMarket,
): number[] {
  const out: number[] = [];
  for (const row of history) {
    const v = statValue(row, market);
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function summarize(values: number[]): FeatureWindow {
  if (values.length === 0) return EMPTY;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return {
    count: values.length,
    mean,
    median,
    stdev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * Build season / L5 / L10 / home / away / H2H feature windows.
 *
 * `history` MUST be sorted descending by game_date (most recent first) — this
 * is how `sync-stats` writes it and how every caller reads it. If you fan out
 * to a path that doesn't preserve that, sort it yourself before calling.
 */
export function computeFeatures(args: {
  player_id: number;
  market: PropMarket;
  history: PlayerGameStatLine[];
  opponent_team_id: number;
}): PlayerFeatures {
  const { player_id, market, history, opponent_team_id } = args;

  const all = extractValues(history, market);
  const last5 = extractValues(history.slice(0, 5), market);
  const last10 = extractValues(history.slice(0, 10), market);
  const home = extractValues(
    history.filter((g) => g.is_home),
    market,
  );
  const away = extractValues(
    history.filter((g) => !g.is_home),
    market,
  );
  const vs = extractValues(
    history.filter((g) => g.team_id !== opponent_team_id),
    market,
  );

  const lastGame = history[0];
  const lastValue = lastGame ? statValue(lastGame, market) : null;

  return {
    player_id,
    market,
    season: summarize(all),
    last5: summarize(last5),
    last10: summarize(last10),
    home: summarize(home),
    away: summarize(away),
    vs_opponent: summarize(vs),
    last_game_value: lastValue,
  };
}

/**
 * Flag when last-game performance deviates > 1.5 sigma from L10 mean.
 * Used by dashboard alerts and prediction reasoning.
 */
export function isAnomalousLastGame(features: PlayerFeatures): boolean {
  const { last10, last_game_value } = features;
  if (last_game_value === null || last10.count < 5 || last10.stdev === 0) {
    return false;
  }
  const z = Math.abs(last_game_value - last10.mean) / last10.stdev;
  return z >= 1.5;
}
