import { computeFeatures } from "./features";
import { scorePrediction } from "./confidence";
import type { Prediction, PredictionInput } from "./types";

/**
 * Produce a single Prediction for a (player, market, line) tuple.
 * Pure function — give it the data, get a pick back.
 *
 * Decides over/under by comparing the L5 mean to the line; the confidence
 * scorer then sanity-checks that pick against every other window.
 */
export function buildPrediction(input: PredictionInput): Prediction {
  const { game, player, team, opponent, history, market, line, signals } =
    input;

  const features = computeFeatures({
    player_id: player.id,
    market,
    history,
    opponent_team_id: opponent.id,
  });

  const isHome = game.home_team.id === team.id;
  const pick =
    features.last5.count > 0 && features.last5.mean >= line ? "over" : "under";

  const { confidence, projection, reasoning } = scorePrediction({
    features,
    line,
    pick,
    is_home: isHome,
    signals,
  });

  return {
    game_id: game.id,
    player_id: player.id,
    market,
    line,
    pick,
    projection,
    confidence,
    expected_value: null,
    reasoning,
    is_bet_of_the_day: false,
    status: "pending",
    generated_at: new Date().toISOString(),
  };
}

/**
 * Pick the highest-confidence prediction across the slate.
 * Requires the L5 window to have contributed (weight > 0) so a thin-data
 * pick can't grab Bet of the Day.
 */
export function pickBetOfTheDay(predictions: Prediction[]): Prediction | null {
  const eligible = predictions.filter((p) => {
    const l5 = p.reasoning.checks.find((c) => c.label === "Last 5 avg");
    return l5 && l5.weight > 0;
  });
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => b.confidence - a.confidence)[0];
}
