import type { PredictionDetail } from "@/lib/sports/soccer/queries";
import { sideLabel } from "@/lib/sports/soccer/labels";

// One engine pick: the fixture, the chosen side, the price + confidence.
export function PickLine({ pick }: { pick: PredictionDetail }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {sideLabel(pick.market, pick.side, pick.line, pick.home, pick.away)}
        </div>
        <div className="truncate text-xs text-foreground/50">
          {pick.home} v {pick.away}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs font-bold tabular-nums">
          {pick.best_odds.toFixed(2)}
        </span>
        <span className="w-12 text-right text-sm font-bold tabular-nums text-primary">
          {Math.round(pick.confidence)}%
        </span>
      </div>
    </div>
  );
}
