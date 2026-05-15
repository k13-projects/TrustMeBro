import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ScoreChart, type ScorePoint } from "@/components/ScoreChart";

export const revalidate = 30;

type SystemScore = {
  id: boolean;
  score: number | string;
  wins: number;
  losses: number;
  voids: number;
  updated_at: string;
};

type HistoryRow = {
  delta: number | string;
  outcome: "won" | "lost" | "void";
  score_after: number | string;
  recorded_at: string;
  prediction_id: string | null;
  prediction:
    | { player_id: number | null }
    | Array<{ player_id: number | null }>
    | null;
};

export default async function ScorePage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: scoreRow }, { data: history }, { data: predictions }] =
    await Promise.all([
      supabase.from("system_score").select("*").eq("id", true).single(),
      supabase
        .from("system_score_history")
        .select(
          "delta, outcome, score_after, recorded_at, prediction_id, prediction:predictions(player_id)",
        )
        .order("recorded_at", { ascending: true })
        .limit(500),
      supabase.from("predictions").select("status"),
    ]);

  const score = Number((scoreRow as SystemScore | null)?.score ?? 0);
  const wins = (scoreRow as SystemScore | null)?.wins ?? 0;
  const losses = (scoreRow as SystemScore | null)?.losses ?? 0;
  const voids =
    (predictions ?? []).filter(
      (p: { status: string }) => p.status === "void",
    ).length;
  const pending =
    (predictions ?? []).filter(
      (p: { status: string }) => p.status === "pending",
    ).length;

  const rows = (history ?? []) as HistoryRow[];
  const chartPoints: ScorePoint[] = rows.map((r) => ({
    scoreAfter: Number(r.score_after),
    delta: Number(r.delta),
    outcome: r.outcome,
    recordedAt: r.recorded_at,
  }));
  const recent = [...rows].reverse().slice(0, 20);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          System Score
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
          Engine Ledger
        </h1>
        <p className="text-sm text-foreground/55 mt-1">
          Is the prediction engine keeping itself above zero? +1.0 per win,
          −0.5 per loss, voids are no-ops. Reset 2026-05-14 — every settlement
          below is real.{" "}
          <Link href="/engine" className="underline underline-offset-2 hover:text-foreground">
            See every pick the engine has graded →
          </Link>
        </p>
      </header>

      <HeroCard
        score={score}
        wins={wins}
        losses={losses}
        voids={voids}
        pending={pending}
        settled={wins + losses + voids}
      />

      {chartPoints.length > 1 ? (
        <section className="glass glass-sheen rounded-2xl p-5 sm:p-6 space-y-3">
          <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            Score over time
          </h2>
          <ScoreChart points={chartPoints} />
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            Recent settlements
          </h2>
          <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
            {recent.map((r, i) => (
              <SettlementRow key={`${r.recorded_at}-${i}`} row={r} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function HeroCard({
  score,
  wins,
  losses,
  voids,
  pending,
  settled,
}: {
  score: number;
  wins: number;
  losses: number;
  voids: number;
  pending: number;
  settled: number;
}) {
  const totalPredictions = settled + pending;
  const tone =
    score > 0
      ? "text-emerald-300"
      : score < 0
        ? "text-rose-300"
        : "text-foreground";
  const sign = score > 0 ? "+" : score < 0 ? "" : "";
  return (
    <section className="relative overflow-hidden rounded-3xl glass-strong glass-sheen grain">
      <div
        aria-hidden
        className="absolute -inset-px opacity-50 pointer-events-none"
        style={{
          background:
            score >= 0
              ? "radial-gradient(40rem 22rem at 12% 30%, rgba(16,185,129,0.4), transparent 60%)"
              : "radial-gradient(40rem 22rem at 12% 30%, rgba(244,63,94,0.4), transparent 60%)",
        }}
      />
      <div className="relative p-6 sm:p-10 space-y-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="space-y-2">
            <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/55">
              Current score
            </p>
            <div className={`text-6xl sm:text-7xl font-semibold tabular-nums ${tone}`}>
              {sign}
              {score.toFixed(1)}
            </div>
            <p className="text-xs text-foreground/55 font-mono">
              {settled} of {totalPredictions} settled · +1.0 / −0.5 ledger
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <StatPill label="Wins" value={wins} tone="emerald" />
            <StatPill label="Losses" value={losses} tone="rose" />
            <StatPill label="Voids" value={voids} tone="neutral" />
            <StatPill label="Pending" value={pending} tone="amber" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "neutral" | "amber";
}) {
  const tones = {
    emerald: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    rose: "bg-rose-400/15 text-rose-300 border-rose-400/30",
    neutral: "bg-white/5 text-foreground/60 border-white/10",
    amber: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  } as const;
  return (
    <div className={`rounded-xl border px-3 py-2 min-w-[88px] ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-80">{label}</div>
      <div className="font-mono tabular-nums text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SettlementRow({ row }: { row: HistoryRow }) {
  const tones = {
    won: "bg-emerald-400/15 text-emerald-300",
    lost: "bg-rose-400/15 text-rose-300",
    void: "bg-white/5 text-foreground/55",
  } as const;
  const delta = Number(row.delta);
  const scoreAfter = Number(row.score_after);
  const predictionShape = Array.isArray(row.prediction)
    ? row.prediction[0] ?? null
    : row.prediction;
  const playerId = predictionShape?.player_id ?? null;
  const href = playerId ? `/players/${playerId}` : "/";
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/3 focus-visible:outline-none focus-visible:bg-white/5"
    >
      <span className="flex items-center gap-3">
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tones[row.outcome]}`}
        >
          {row.outcome}
        </span>
        <span className="font-mono tabular-nums text-sm text-foreground/80">
          {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
        </span>
      </span>
      <span className="flex items-center gap-3 text-xs text-foreground/55">
        <span className="font-mono tabular-nums">
          → {scoreAfter.toFixed(1)}
        </span>
        <time
          dateTime={row.recorded_at}
          className="font-mono tabular-nums hidden sm:inline"
        >
          {new Date(row.recorded_at).toLocaleString()}
        </time>
      </span>
    </Link>
  );
}
