import { getSoccerScore } from "@/lib/sports/soccer/queries";
import { FootballHeader } from "@/components/soccer/FootballHeader";

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
  const s = await getSoccerScore();
  const settled = s.wins + s.losses;
  const hitRate = settled > 0 ? Math.round((s.wins / settled) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      <div>
        <FootballHeader title="Engine Scoreboard" />
        <p className="mt-2 text-sm text-foreground/55">
          Football&apos;s own ledger — separate from the NBA engine. +1 per win,
          −1 per loss.
        </p>
      </div>

      <div className="rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/15 to-transparent px-6 py-8 text-center">
        <div className="text-xs uppercase tracking-wide text-foreground/55">Net Units</div>
        <div
          className={`mt-1 text-6xl font-black tabular-nums ${
            s.score > 0 ? "text-emerald-400" : s.score < 0 ? "text-rose-400" : ""
          }`}
        >
          {s.score > 0 ? "+" : ""}
          {s.score}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Wins" value={String(s.wins)} tone="text-emerald-400" />
        <Stat label="Losses" value={String(s.losses)} tone="text-rose-400" />
        <Stat label="Voids" value={String(s.voids)} />
        <Stat label="Hit Rate" value={`${hitRate}%`} />
      </div>
    </div>
  );
}
