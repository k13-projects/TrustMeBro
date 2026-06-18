import type { SoccerCartPick } from "@/components/cart/CartContext";
import type { PredictionDetail } from "./queries";

// Maps an engine soccer prediction into the shape the coupon cart stores.
// Pure (no server access) so server components can build the prop they pass to
// the client-side AddToCouponButton.
export function toSoccerCartPick(p: PredictionDetail): SoccerCartPick {
  return {
    sport: "soccer",
    prediction_id: p.id,
    match_id: p.match_id,
    market: p.market,
    side: p.side,
    line: p.line,
    confidence: p.confidence,
    best_odds: p.best_odds,
    home: p.home,
    away: p.away,
    home_abbr: p.home_abbr,
    away_abbr: p.away_abbr,
  };
}
