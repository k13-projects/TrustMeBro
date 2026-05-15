import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
};

export default async function ScorePage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: scoreRow }, { data: history }, { data: predictions }] =
    await Promise.all([
      supabase.from("system_score").select("*").eq("id", true).single(),
      supabase
        .from("system_score_history")
        .select("delta, outcome, score_after, recorded_at, prediction_id")
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
  const series = rows.map((r) => Number(r.score_after));
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
          +1.0 per win, −0.5 per loss. Voids are no-ops. The engine&apos;s
          objective is to stay above zero.
        </p>
      </header>

      <HeroCard score={score} wins={wins} losses={losses} voids={voids} pending={pending} />

      {series.length > 1 ? (
        <section className="glass glass-sheen rounded-2xl p-5 sm:p-6 space-y-3">
          <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            Score over time
          </h2>
          <ScoreChart values={series} />
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
}: {
  score: number;
  wins: number;
  losses: number;
  voids: number;
  pending: number;
}) {
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
              +1.0 / −0.5 ledger
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

function ScoreChart({ values }: { values: number[] }) {
  const W = 720;
  const H = 220;
  const P = 16;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const stepX = (W - P * 2) / Math.max(1, values.length - 1);
  const yFor = (v: number) =>
    H - P - ((v - min) / range) * (H - P * 2);
  const points = values.map((v, i) => [P + i * stepX, yFor(v)] as const);
  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");
  const areaPath =
    `${linePath} L ${points[points.length - 1][0]} ${H - P} L ${P} ${H - P} Z`;
  const zeroY = yFor(0);
  const finalTone = values[values.length - 1] >= 0 ? "emerald" : "rose";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Score history over ${values.length} settlements`}
    >
      <defs>
        <linearGradient id="score-stroke" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(52 211 153)" />
          <stop offset={`${((max - 0) / range) * 100}%`} stopColor="rgb(52 211 153)" />
          <stop offset={`${((max - 0) / range) * 100}%`} stopColor="rgb(244 63 94)" />
          <stop offset="100%" stopColor="rgb(244 63 94)" />
        </linearGradient>
        <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1={P}
        y1={zeroY}
        x2={W - P}
        y2={zeroY}
        stroke="rgba(255,255,255,0.18)"
        strokeDasharray="3 5"
        strokeWidth="1"
      />
      <path d={areaPath} fill="url(#score-fill)" />
      <path
        d={linePath}
        fill="none"
        stroke="url(#score-stroke)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r="4"
        fill={finalTone === "emerald" ? "rgb(52 211 153)" : "rgb(244 63 94)"}
      />
      <text
        x={W - P}
        y={P + 4}
        textAnchor="end"
        className="text-[10px]"
        fill="rgba(255,255,255,0.55)"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {max.toFixed(1)}
      </text>
      <text
        x={W - P}
        y={H - P + 12}
        textAnchor="end"
        className="text-[10px]"
        fill="rgba(255,255,255,0.55)"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {min.toFixed(1)}
      </text>
    </svg>
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
  return (
    <Link
      href={row.prediction_id ? `/?pick=${row.prediction_id}` : "/"}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/3"
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
