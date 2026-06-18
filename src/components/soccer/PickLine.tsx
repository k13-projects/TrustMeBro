import type { PredictionDetail } from "@/lib/sports/soccer/queries";
import { sideLabel } from "@/lib/sports/soccer/labels";
import { AddToCouponButton } from "@/components/cart/AddToCouponButton";
import { toSoccerCartPick } from "@/lib/sports/soccer/cart";
import { MatchBanner } from "./MatchBanner";

// One engine pick: the matchup (compact versus banner), the chosen side, the
// price + confidence, and an add-to-coupon control so users can lift a single
// leg into their own coupon.
export function PickLine({ pick }: { pick: PredictionDetail }) {
  return (
    <div className="space-y-1.5 py-2.5">
      <MatchBanner
        size="sm"
        home={{ name: pick.home, abbreviation: pick.home_abbr, crest: pick.home_crest }}
        away={{ name: pick.away, abbreviation: pick.away_abbr, crest: pick.away_crest }}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold">
          {sideLabel(pick.market, pick.side, pick.line, pick.home, pick.away)}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs font-bold tabular-nums">
            {pick.best_odds.toFixed(2)}
          </span>
          <span className="w-12 text-right text-sm font-bold tabular-nums text-primary">
            {Math.round(pick.confidence)}%
          </span>
        </span>
      </div>
      <div className="flex">
        <AddToCouponButton pick={toSoccerCartPick(pick)} />
      </div>
    </div>
  );
}
