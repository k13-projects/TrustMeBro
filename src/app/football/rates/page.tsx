import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { currentRound, getMatchesBetween, getRounds } from "@/lib/sports/soccer/queries";
import { getSoccerRates } from "@/lib/sports/soccer/rates";
import { MatchRates } from "@/components/soccer/MatchRates";
import { FootballHeader } from "@/components/soccer/FootballHeader";

export const dynamic = "force-dynamic";

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
  const competition = await activeCompetition();
  const meta = COMPETITIONS[competition];
  const today = todayIsoDate();
  const matches = await getMatchesBetween(competition, today, isoDateOffset(today, 7));
  const rates = await getSoccerRates(matches.map((m) => m.id));
  const priced = matches.filter((m) => (rates.get(m.id)?.length ?? 0) > 0);

  const dates = [...new Set(priced.map((m) => m.date))].sort();
  const byDate = dates.map((date) => ({
    date,
    matches: priced.filter((m) => m.date === date),
  }));

  // When nothing is priced yet, say when the next round kicks off.
  let nextUp: string | null = null;
  if (byDate.length === 0 && meta.status === "live") {
    const round = currentRound(await getRounds(competition), today);
    if (round && round.from >= today) {
      nextUp = `${round.label} starts ${new Date(`${round.from}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <FootballHeader title="Match Odds" competition={competition} />
        <p className="mt-2 text-sm text-foreground/55">
          De-vigged win odds for <span className="text-foreground/80">every</span>{" "}
          game — the market&apos;s real probability per outcome, not just the
          matches the engine picked. Best price across ~40 European books shown
          under each rate.
        </p>
      </div>

      {byDate.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center text-sm text-foreground/45">
          {meta.status === "archived"
            ? "The tournament is over — live prices are no longer tracked."
            : `No priced matches right now — odds populate in the day or so before kickoff.${nextUp ? ` ${nextUp}.` : ""}`}
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
