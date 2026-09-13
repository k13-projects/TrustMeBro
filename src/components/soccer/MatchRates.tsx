import type { MatchRow } from "@/lib/sports/soccer/queries";
import type { MarketRates } from "@/lib/sports/soccer/rates";
import { marketLabel } from "@/lib/sports/soccer/labels";
import type { MatchSide } from "@/lib/sports/types";
import { MatchBanner } from "./MatchBanner";

function shortSide(side: MatchSide, line: number | null): string {
  switch (side) {
    case "home":
      return "Home";
    case "draw":
      return "Draw";
    case "away":
      return "Away";
    case "over":
      return `Over ${line ?? ""}`.trim();
    case "under":
      return `Under ${line ?? ""}`.trim();
    case "yes":
      return "BTTS";
    case "no":
      return "No BTTS";
  }
}

// One match's priced markets as rate tiles — the /football/rates board's
// per-match card, also reused on the match detail page's Odds section.
export function MatchRates({
  match,
  markets,
}: {
  match: MatchRow;
  markets: MarketRates[];
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-border/60 bg-card/40 p-4 sm:p-5">
      <MatchBanner
        competition={match.competition}
        home={match.home}
        away={match.away}
        state={match.state}
        clock={match.clock}
        datetime={match.datetime}
        score={
          match.state !== "pre"
            ? { home: match.home_score, away: match.away_score }
            : null
        }
      />

      <div className="space-y-3">
        {markets.map((mk) => {
          const topProb = Math.max(...mk.outcomes.map((o) => o.prob));
          return (
            <div key={`${mk.market}:${mk.line ?? ""}`}>
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                <span>{marketLabel(mk.market)}</span>
                <span className="text-foreground/30">{mk.bookCount} books</span>
              </div>
              <div
                className={`grid gap-2 ${
                  mk.outcomes.length === 3 ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                {mk.outcomes.map((o) => {
                  const isTop = o.prob === topProb && o.prob >= 0.5;
                  return (
                    <div
                      key={o.side}
                      className={`rounded-xl border px-3 py-2 text-center ${
                        isTop
                          ? "border-primary/50 bg-primary/10"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-foreground/55">
                        {shortSide(o.side, mk.line)}
                      </div>
                      <div
                        className={`text-lg font-black tabular-nums ${
                          isTop ? "text-primary" : "text-white"
                        }`}
                      >
                        {Math.round(o.prob * 100)}%
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-foreground/45">
                        {o.bestOdds ? o.bestOdds.toFixed(2) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
