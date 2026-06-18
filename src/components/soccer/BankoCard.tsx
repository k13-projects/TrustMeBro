import type { PredictionDetail } from "@/lib/sports/soccer/queries";
import { marketLabel, sideLabel } from "@/lib/sports/soccer/labels";
import { AddToCouponButton } from "@/components/cart/AddToCouponButton";
import { toSoccerCartPick } from "@/lib/sports/soccer/cart";
import { MatchBanner } from "./MatchBanner";

// The most-trusted single pick. Bold, gold, "lock it in" energy.
export function BankoCard({ pick }: { pick: PredictionDetail }) {
  return (
    <div className="rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/15 to-transparent p-5">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-primary px-3 py-1 text-xs font-black uppercase tracking-wider text-primary-foreground">
          🔒 Banko
        </span>
        <span className="text-2xl font-black tabular-nums text-primary">
          {Math.round(pick.confidence)}%
        </span>
      </div>
      <div className="mt-3">
        <MatchBanner
          size="sm"
          home={{ name: pick.home, abbreviation: pick.home_abbr, crest: pick.home_crest }}
          away={{ name: pick.away, abbreviation: pick.away_abbr, crest: pick.away_crest }}
        />
      </div>
      <h3 className="mt-2 text-lg font-black">
        {sideLabel(pick.market, pick.side, pick.line, pick.home, pick.away)}
        <span className="ml-2 text-sm font-semibold text-foreground/45">
          {marketLabel(pick.market)}
        </span>
      </h3>
      <div className="mt-3 flex items-center gap-3 text-sm">
        <span className="rounded-full bg-white/8 px-2.5 py-0.5 font-bold tabular-nums">
          {pick.best_odds.toFixed(2)}
        </span>
        {pick.expected_value !== null ? (
          <span
            className={
              pick.expected_value >= 0 ? "text-emerald-400" : "text-foreground/45"
            }
          >
            EV {pick.expected_value >= 0 ? "+" : ""}
            {(pick.expected_value * 100).toFixed(0)}%
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex">
        <AddToCouponButton pick={toSoccerCartPick(pick)} variant="card" />
      </div>
    </div>
  );
}
