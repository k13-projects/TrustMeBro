import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import {
  getEngineBreakdown,
  getSoccerScore,
  getSoccerScoreHistory,
} from "@/lib/sports/soccer/queries";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { ScoreChart } from "@/components/ScoreChart";
import { EngineBreakdown } from "@/components/soccer/EngineBreakdown";

export const dynamic = "force-dynamic";

// Every tile is a real link to the settled history behind the number — the
// scoreboard is a summary, /football/results is the receipt.
function Stat({
  label,
  value,
  tone,
  href,
  ariaLabel,
}: {
  label: string;
  value: string;
  tone?: string;
  href: string;
  ariaLabel: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="group rounded-2xl border border-border/60 bg-card/40 px-5 py-4 text-center transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-colors motion-reduce:hover:translate-y-0"
    >
      <div className={`text-3xl font-black tabular-nums ${tone ?? ""}`}>{value}</div>
      <div className="mt-1 flex items-center justify-center gap-1 text-xs uppercase tracking-wide text-foreground/50">
        {label}
        <ArrowRight
          size={12}
          className="-mr-3 opacity-0 transition-opacity group-hover:mr-0 group-hover:opacity-100 motion-reduce:transition-none"
          aria-hidden
        />
      </div>
    </Link>
  );
}

export default async function ScoreboardPage() {
  const competition = await activeCompetition();
  const meta = COMPETITIONS[competition];
  const [s, history, breakdown] = await Promise.all([
    getSoccerScore(competition),
    getSoccerScoreHistory(competition),
    getEngineBreakdown(competition),
  ]);
  const settled = s.wins + s.losses;
  const hitRate = settled > 0 ? Math.round((s.wins / settled) * 100) : 0;
  const archived = meta.status === "archived";

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <FootballHeader title="Engine Scoreboard" competition={competition} />
        <p className="mt-2 text-sm text-foreground/55">
          {archived
            ? `The ${meta.fullName} ledger, frozen at the final whistle. +1 per win, −1 per loss.`
            : `${meta.label}'s own ledger — separate from the World Cup and the NBA. +1 per win, −1 per loss.`}
        </p>
      </div>

      <div className="rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/15 to-transparent px-6 py-8 text-center">
        <div className="text-xs uppercase tracking-wide text-foreground/55">
          {archived ? "Final net units" : "Net Units"}
        </div>
        <div
          className={`mt-1 text-6xl font-black tabular-nums ${
            s.score > 0 ? "text-emerald-400" : s.score < 0 ? "text-rose-400" : ""
          }`}
        >
          {s.score > 0 ? "+" : ""}
          {s.score}
        </div>
      </div>

      {history.length >= 2 ? (
        <div className="rounded-3xl border border-border/60 bg-card/40 px-4 py-5 sm:px-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.18em] text-foreground/55">
              Units over time
            </div>
            <div className="text-[11px] text-foreground/40">
              {history.length} settled · hover to inspect
            </div>
          </div>
          <ScoreChart points={history} />
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center text-sm text-foreground/45">
          {archived
            ? "No graded picks were recorded for this competition."
            : meta.oddsKey === null
              ? "No bookmaker odds for this competition yet, so the engine has nothing to pick — and nothing to grade."
              : `The units graph appears once a couple of picks have settled — the first ${meta.label} picks grade after the next matchday.`}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Wins"
          value={String(s.wins)}
          tone="text-emerald-400"
          href="/football/results?outcome=won"
          ariaLabel={`View ${s.wins} settled wins for ${meta.label}`}
        />
        <Stat
          label="Losses"
          value={String(s.losses)}
          tone="text-rose-400"
          href="/football/results?outcome=lost"
          ariaLabel={`View ${s.losses} settled losses for ${meta.label}`}
        />
        <Stat
          label="Voids"
          value={String(s.voids)}
          href="/football/results?outcome=void"
          ariaLabel={`View ${s.voids} settled voids for ${meta.label}`}
        />
        <Stat
          label="Hit Rate"
          value={`${hitRate}%`}
          href="/football/results"
          ariaLabel={`View all ${settled} settled picks for ${meta.label}`}
        />
      </div>

      <EngineBreakdown breakdown={breakdown} />
    </div>
  );
}
