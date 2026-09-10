import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { getSoccerScore, getSoccerScoreHistory } from "@/lib/sports/soccer/queries";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { ScoreChart } from "@/components/ScoreChart";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 px-5 py-4 text-center">
      <div className={`text-3xl font-black tabular-nums ${tone ?? ""}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-foreground/50">{label}</div>
    </div>
  );
}

export default async function ScoreboardPage() {
  const competition = await activeCompetition();
  const meta = COMPETITIONS[competition];
  const [s, history] = await Promise.all([
    getSoccerScore(competition),
    getSoccerScoreHistory(competition),
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
            : "The units graph appears once a couple of picks have settled — the first Champions League picks grade after the next matchday."}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Wins" value={String(s.wins)} tone="text-emerald-400" />
        <Stat label="Losses" value={String(s.losses)} tone="text-rose-400" />
        <Stat label="Voids" value={String(s.voids)} />
        <Stat label="Hit Rate" value={`${hitRate}%`} />
      </div>
    </div>
  );
}
