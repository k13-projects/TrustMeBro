import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { getMatchesByDates, type MatchRow } from "@/lib/sports/soccer/queries";
import { getSoccerRates, type MarketRates } from "@/lib/sports/soccer/rates";
import { marketLabel } from "@/lib/sports/soccer/labels";
import type { MatchSide } from "@/lib/sports/types";
import { MatchBanner } from "@/components/soccer/MatchBanner";
import { FootballHeader } from "@/components/soccer/FootballHeader";

export const dynamic = "force-dynamic";

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

function dateHeading(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === isoDateOffset(today, 1)) return "Tomorrow";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

export default async function RatesPage() {
  const today = todayIsoDate();
  const dates = [0, 1, 2, 3, 4, 5, 6].map((d) => isoDateOffset(today, d));
  const matches = await getMatchesByDates(dates);
  const rates = await getSoccerRates(matches.map((m) => m.id));
  const priced = matches.filter((m) => (rates.get(m.id)?.length ?? 0) > 0);

  const byDate = dates
    .map((date) => ({ date, matches: priced.filter((m) => m.date === date) }))
    .filter((g) => g.matches.length > 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      <div>
        <FootballHeader title="Match Rates" />
        <p className="mt-2 text-sm text-foreground/55">
          De-vigged win odds for <span className="text-foreground/80">every</span>{" "}
          game — the market&apos;s real probability per outcome, not just the
          matches the engine picked. Best price across books shown under each rate.
        </p>
      </div>

      {byDate.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center text-sm text-foreground/45">
          No priced matches right now — odds populate in the day or so before
          kickoff.
        </p>
      ) : (
        <div className="space-y-10">
          {byDate.map((group) => (
            <section key={group.date} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/40">
                {dateHeading(group.date, today)}
              </h2>
              <div className="space-y-3">
                {group.matches.map((m) => (
                  <MatchRates key={m.id} match={m} markets={rates.get(m.id)!} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchRates({
  match,
  markets,
}: {
  match: MatchRow;
  markets: MarketRates[];
}) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card/40 p-4 sm:p-5 space-y-4">
      <MatchBanner
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
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                {marketLabel(mk.market)}
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
