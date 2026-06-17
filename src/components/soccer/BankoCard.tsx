import type { PredictionDetail } from "@/lib/sports/soccer/queries";
import { marketLabel, sideLabel } from "@/lib/sports/soccer/labels";
import { CountryFlag } from "./CountryFlag";

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
      <h3 className="mt-3 text-lg font-black">
        {sideLabel(pick.market, pick.side, pick.line, pick.home, pick.away)}
      </h3>
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground/55">
        <CountryFlag crest={pick.home_crest} abbr={pick.home_abbr} name={pick.home} size={16} />
        <span>{pick.home}</span>
        <span className="text-foreground/30">v</span>
        <CountryFlag crest={pick.away_crest} abbr={pick.away_abbr} name={pick.away} size={16} />
        <span>{pick.away}</span>
        <span className="text-foreground/35">· {marketLabel(pick.market)}</span>
      </p>
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
    </div>
  );
}
