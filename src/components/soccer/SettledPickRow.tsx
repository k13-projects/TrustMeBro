import { Check, Minus, X } from "lucide-react";
import type { PredictionDetail } from "@/lib/sports/soccer/queries";
import { marketLabel, sideLabel } from "@/lib/sports/soccer/labels";

// One graded pick: outcome chip, the matchup, what was backed, the price.
export function SettledPickRow({ pick }: { pick: PredictionDetail }) {
  const tone =
    pick.status === "won"
      ? { Icon: Check, cls: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30", text: "Won" }
      : pick.status === "lost"
        ? { Icon: X, cls: "bg-rose-400/15 text-rose-300 ring-rose-400/30", text: "Lost" }
        : { Icon: Minus, cls: "bg-white/8 text-foreground/60 ring-white/10", text: "Void" };
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ring-1 ${tone.cls}`}
      >
        <tone.Icon size={11} strokeWidth={3} />
        {tone.text}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {sideLabel(pick.market, pick.side, pick.line, pick.home, pick.away)}
        </div>
        <div className="truncate text-xs text-foreground/50">
          {pick.home} v {pick.away} · {marketLabel(pick.market)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold tabular-nums">{pick.best_odds.toFixed(2)}</div>
        <div className="text-[11px] tabular-nums text-foreground/45">
          {Math.round(pick.confidence)}%
        </div>
      </div>
    </div>
  );
}
