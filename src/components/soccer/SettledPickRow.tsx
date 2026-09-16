import Link from "next/link";
import { Check, Minus, X } from "lucide-react";
import type { PredictionDetail } from "@/lib/sports/soccer/queries";
import { marketLabel, sideLabel } from "@/lib/sports/soccer/labels";
import { TierBadge } from "./TierBadge";

// One graded pick. "Over 2.5 goals — LOST" on its own makes a reader go and
// look up what happened, so the row carries the final score and, where the
// score alone doesn't explain it, the number the bet actually turned on.
function outcomeNote(pick: PredictionDetail): string | null {
  const { home_score: hs, away_score: as } = pick;
  if (hs === null || as === null) return null;
  if (pick.market === "total_goals") {
    const total = hs + as;
    return `${total} ${total === 1 ? "goal" : "goals"}`;
  }
  if (pick.market === "btts") {
    return hs > 0 && as > 0 ? "both scored" : "one side blanked";
  }
  if (hs === as) return "draw";
  return null;
}

export function SettledPickRow({ pick }: { pick: PredictionDetail }) {
  const tone =
    pick.status === "won"
      ? { Icon: Check, cls: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30", text: "Won" }
      : pick.status === "lost"
        ? { Icon: X, cls: "bg-rose-400/15 text-rose-300 ring-rose-400/30", text: "Lost" }
        : { Icon: Minus, cls: "bg-white/8 text-foreground/60 ring-white/10", text: "Void" };

  const played = pick.home_score !== null && pick.away_score !== null;
  const homeWon = played && pick.home_score! > pick.away_score!;
  const awayWon = played && pick.away_score! > pick.home_score!;
  const note = outcomeNote(pick);

  return (
    <Link
      href={`/football/match/${pick.match_id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
    >
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ring-1 ${tone.cls}`}
      >
        <tone.Icon size={11} strokeWidth={3} aria-hidden />
        {tone.text}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <TierBadge isBanko={pick.is_banko} />
          <span className="truncate text-sm font-semibold">
            {sideLabel(pick.market, pick.side, pick.line, pick.home, pick.away)}
          </span>
        </div>
        <div className="truncate text-xs text-foreground/50">
          {played ? (
            <>
              <span className={homeWon ? "font-semibold text-foreground/80" : ""}>
                {pick.home}
              </span>{" "}
              <span className="font-bold tabular-nums text-foreground/90">
                {pick.home_score}–{pick.away_score}
              </span>{" "}
              <span className={awayWon ? "font-semibold text-foreground/80" : ""}>
                {pick.away}
              </span>
              {note ? <span className="text-foreground/40"> · {note}</span> : null}
            </>
          ) : (
            <>
              {pick.home} v {pick.away}
            </>
          )}
          <span className="text-foreground/40"> · {marketLabel(pick.market)}</span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-sm font-bold tabular-nums">{pick.best_odds.toFixed(2)}</div>
        <div className="text-[11px] tabular-nums text-foreground/45">
          {Math.round(pick.confidence)}%
        </div>
      </div>
    </Link>
  );
}
