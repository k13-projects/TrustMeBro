import Link from "next/link";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { GLOSSARY, GLOSSARY_ORDER } from "@/lib/sports/soccer/glossary";
import { FootballHeader } from "@/components/soccer/FootballHeader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How to read this site · TrustMeBro",
};

export default async function GlossaryPage() {
  const competition = await activeCompetition();

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <div>
        <FootballHeader
          title="How to read this site"
          competition={competition}
          eyebrow="Plain English"
        />
        <p className="mt-2 text-sm text-foreground/60">
          Every word this site uses, explained once, without jargon.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl uppercase tracking-tight">
          What the engine actually does
        </h2>
        <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-5 text-sm leading-relaxed text-foreground/75">
          <p>
            Before a match we collect the odds from about forty bookmakers,
            strip out each one&apos;s built-in margin, and average what is left.
            That gives a probability for every outcome that is not one
            bookmaker&apos;s opinion but the market&apos;s, with the house cut
            removed.
          </p>
          <p>
            The league table nudges that number slightly, and the engine then
            backs only its single strongest read in each market, and only when
            that read is better than a coin flip. Backing every outcome would
            guarantee losing more often than winning.
          </p>
          <p>
            After the final whistle every pick is graded against the real
            score. A win adds one unit, a loss takes one away, and a void
            changes nothing. Nothing is edited afterwards, which is why the
            scoreboard shows losses as plainly as wins.
          </p>
          <p className="text-foreground/55">
            This is an analysis tool. It shows projections; it does not take
            bets and is not advice.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl uppercase tracking-tight">The words</h2>
        <dl className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
          {GLOSSARY_ORDER.map((key) => {
            const entry = GLOSSARY[key];
            return (
              <div key={key} className="px-5 py-4">
                <dt className="font-display text-base uppercase tracking-[0.04em] text-primary">
                  {entry.term}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-foreground/80">
                  {entry.short}
                  {"long" in entry && entry.long ? (
                    <span className="mt-1 block text-foreground/55">{entry.long}</span>
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <p className="text-sm text-foreground/55">
        Still unclear on something?{" "}
        <Link href="/football/picks" className="font-semibold text-primary">
          Look at today&apos;s picks
        </Link>{" "}
        with this page open, or ask the bot in the corner.
      </p>
    </div>
  );
}
