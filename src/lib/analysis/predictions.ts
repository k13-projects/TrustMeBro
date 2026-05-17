import { computeFeatures, isAnomalousLastGame } from "./features";
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
  const { game, player, team, opponent, history, market, line, signals, best_odds } =
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

  const scored = scorePrediction({
    features,
    line,
    pick,
    is_home: isHome,
    signals,
  });

  // Surface the "normally 8 but last game was 5" warning Eren asked for.
  // Weight 0 keeps it visible without skewing the score; we apply a small
  // explicit penalty below only when the anomaly contradicts an over-pick.
  const reasoning = { ...scored.reasoning, checks: [...scored.reasoning.checks] };
  let confidence = scored.confidence;
  if (isAnomalousLastGame(features) && features.last_game_value !== null) {
    reasoning.checks.push({
      label: "Last game anomaly",
      passed: false,
      value: features.last_game_value,
      target: features.last10.mean,
      weight: 0,
    });
    if (pick === "over" && features.last_game_value < features.last10.mean) {
      confidence = Math.max(0, confidence - 3);
    }
  }

  // Kelly-style EV in units of stake: (P(win) * decimal_odds) - 1.
  // Positive ⇒ +EV bet at the available price. Only meaningful when we have a
  // real bookmaker quote — synthetic lines would produce noise.
  let expected_value: number | null = null;
  if (best_odds) {
    reasoning.odds = {
      bookmaker: best_odds.bookmaker,
      price_decimal: best_odds.price_decimal,
      price_american: best_odds.price_american,
      book_count: best_odds.book_count,
    };
    expected_value = (confidence / 100) * best_odds.price_decimal - 1;
  }

  return {
    game_id: game.id,
    player_id: player.id,
    market,
    line,
    pick,
    projection: scored.projection,
    confidence,
    expected_value,
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
