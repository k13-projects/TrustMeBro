import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ScoreChart, type ScorePoint } from "@/components/ScoreChart";
import { marketLabel } from "@/components/MarketLabel";
import {
  getCouponLedger,
  type CouponLedger,
  type CouponLedgerRow,
} from "@/lib/scoring/coupons";

export const revalidate = 30;

type SystemScore = {
  id: boolean;
  score: number | string;
  wins: number;
  losses: number;
  voids: number;
  updated_at: string;
};

type TeamShape = { id: number; abbreviation: string };
type PlayerShape = {
  id: number;
  first_name: string;
  last_name: string;
  team: TeamShape | TeamShape[] | null;
};
type PredictionShape = {
  player_id: number | null;
  market: string | null;
  line: number | string | null;
  pick: "over" | "under" | null;
  player: PlayerShape | PlayerShape[] | null;
};

type HistoryRow = {
  delta: number | string;
  outcome: "won" | "lost" | "void";
  score_after: number | string;
  recorded_at: string;
  prediction_id: string | null;
  prediction: PredictionShape | PredictionShape[] | null;
};

export default async function ScorePage() {
  const supabase = await createSupabaseServerClient();

  const [
    { data: scoreRow },
    { data: history },
    { data: predictions },
    couponLedger,
  ] = await Promise.all([
    supabase.from("system_score").select("*").eq("id", true).single(),
    supabase
      .from("system_score_history")
      .select(
        "delta, outcome, score_after, recorded_at, prediction_id, " +
          "prediction:predictions(player_id, market, line, pick, " +
          "player:players(id, first_name, last_name, team:teams(id, abbreviation)))",
      )
      .order("recorded_at", { ascending: true })
      .limit(500),
    supabase.from("predictions").select("status"),
    getCouponLedger({ recentLimit: 15 }),
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

  const rows = (history ?? []) as unknown as HistoryRow[];
  const chartPoints: ScorePoint[] = rows.map((r) => ({
    scoreAfter: Number(r.score_after),
    delta: Number(r.delta),
    outcome: r.outcome,
    recordedAt: r.recorded_at,
  }));
  const recent = [...rows].reverse().slice(0, 20);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-12">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          System Score
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
          The Ledger
        </h1>
        <p className="text-sm text-foreground/55 mt-1 max-w-prose">
          Two separate scoreboards. The engine ledger tracks every prediction
          the system grades — +1 per win, −1 per loss, voids are no-ops. The
          coupon ledger tracks how the bros are doing on the parlays they
          actually shared, broken down by leg count.
        </p>
      </header>

      <section className="space-y-5">
        <SectionHeader
          kicker="Engine ledger"
          title="The engine's own picks"
          subtitle={
            <>
              +1.0 per hit, −1.0 per miss. Reset 2026-05-14 — every
              settlement below is real.{" "}
              <Link
                href="/engine"
                className="underline underline-offset-2 hover:text-foreground"
              >
                See every pick →
              </Link>
            </>
          }
        />

        <HeroCard
          score={score}
          wins={wins}
          losses={losses}
          voids={voids}
          pending={pending}
          settled={wins + losses + voids}
        />

        {chartPoints.length > 1 ? (
          <div className="glass glass-sheen rounded-2xl p-5 sm:p-6 space-y-3">
            <h3 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
              Score over time
            </h3>
            <ScoreChart points={chartPoints} />
          </div>
        ) : null}

        {recent.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
              Recent settlements
            </h3>
            <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
              {recent.map((r, i) => (
                <SettlementRow key={`${r.recorded_at}-${i}`} row={r} />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-5">
        <SectionHeader
          kicker="Coupon ledger"
          title="What the bros are running"
          subtitle={
            <>
              One score across every <em>shared</em> coupon on{" "}
              <Link
                href="/bros"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Bro Board
              </Link>
              . A clean parlay that hits all legs banks{" "}
              <span className="text-foreground/85">+1 per leg</span>. A slip
              that misses bleeds <span className="text-foreground/85">−1 per missed leg</span>.
              Voids are no-ops.
            </>
          }
        />
        <CouponLedgerHero ledger={couponLedger} />
        {couponLedger.per_pick_count.length > 0 ? (
          <CouponBreakdownGrid breakdown={couponLedger.per_pick_count} />
        ) : null}
        {couponLedger.recent.length > 0 ? (
          <CouponRecentList rows={couponLedger.recent} />
        ) : null}
      </section>
    </div>
  );
}

function SectionHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: React.ReactNode;
}) {
  return (
    <header className="space-y-1">
      <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
        {kicker}
      </p>
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="text-sm text-foreground/55 max-w-prose">{subtitle}</p>
    </header>
  );
}

function CouponLedgerHero({ ledger }: { ledger: CouponLedger }) {
  const totalPredictions = ledger.total;
  const tone =
    ledger.score > 0
      ? "text-emerald-300"
      : ledger.score < 0
        ? "text-rose-300"
        : "text-foreground";
  const sign = ledger.score > 0 ? "+" : ledger.score < 0 ? "" : "";
  return (
    <section className="relative overflow-hidden rounded-3xl glass-strong glass-sheen grain">
      <div
        aria-hidden
        className="absolute -inset-px opacity-50 pointer-events-none"
        style={{
          background:
            ledger.score >= 0
              ? "radial-gradient(40rem 22rem at 88% 30%, rgba(255,184,0,0.32), transparent 60%)"
              : "radial-gradient(40rem 22rem at 88% 30%, rgba(244,63,94,0.4), transparent 60%)",
        }}
      />
      <div className="relative p-6 sm:p-10 space-y-6">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="space-y-2">
            <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/55">
              Coupon score
            </p>
            <div className={`text-6xl sm:text-7xl font-semibold tabular-nums ${tone}`}>
              {sign}
              {ledger.score.toFixed(0)}
            </div>
            <p className="text-xs text-foreground/55 font-mono">
              {ledger.settled} of {totalPredictions} settled · per-leg ledger
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <StatPill label="Won" value={ledger.wins} tone="emerald" />
            <StatPill label="Lost" value={ledger.losses} tone="rose" />
            <StatPill label="Refund" value={ledger.voids} tone="neutral" />
            <StatPill label="Pending" value={ledger.pending} tone="amber" />
          </div>
        </div>
      </div>
    </section>
  );
}

function CouponBreakdownGrid({
  breakdown,
}: {
  breakdown: CouponLedger["per_pick_count"];
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
        By leg count
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {breakdown.map((b) => (
          <BreakdownCard key={b.pick_count} bucket={b} />
        ))}
      </div>
    </div>
  );
}

function BreakdownCard({
  bucket,
}: {
  bucket: CouponLedger["per_pick_count"][number];
}) {
  const tone =
    bucket.score > 0
      ? "text-emerald-300"
      : bucket.score < 0
        ? "text-rose-300"
        : "text-foreground/85";
  const sign = bucket.score > 0 ? "+" : bucket.score < 0 ? "" : "";
  return (
    <div className="glass rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-foreground/55">
        <span className="rounded-full bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 font-medium">
          {bucket.pick_count}× pick
        </span>
        <span className="font-mono tabular-nums text-foreground/45">
          {bucket.total}
        </span>
      </div>
      <div className={`text-3xl font-semibold font-mono tabular-nums ${tone}`}>
        {sign}
        {bucket.score.toFixed(0)}
      </div>
      <div className="text-[11px] font-mono tabular-nums text-foreground/60 flex gap-2">
        <span className="text-emerald-300">{bucket.wins}W</span>
        <span className="text-rose-300">{bucket.losses}L</span>
        {bucket.voids > 0 ? (
          <span className="text-foreground/45">{bucket.voids}V</span>
        ) : null}
        {bucket.pending > 0 ? (
          <span className="text-amber-300">{bucket.pending}P</span>
        ) : null}
      </div>
    </div>
  );
}

function CouponRecentList({ rows }: { rows: CouponLedgerRow[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
        Recent shared coupons
      </h3>
      <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
        {rows.map((r) => (
          <CouponLedgerRowView key={r.coupon_id} row={r} />
        ))}
      </div>
    </div>
  );
}

function CouponLedgerRowView({ row }: { row: CouponLedgerRow }) {
  const tones = {
    pending: "bg-white/5 text-foreground/55",
    won: "bg-emerald-400/15 text-emerald-300",
    lost: "bg-rose-400/15 text-rose-300",
    void: "bg-white/5 text-foreground/55",
  } as const;
  const scoreTone =
    row.score > 0
      ? "text-emerald-300"
      : row.score < 0
        ? "text-rose-300"
        : "text-foreground/55";
  const sign = row.score > 0 ? "+" : row.score < 0 ? "" : "";
  const handle = row.user?.handle ?? null;
  const display = row.user?.display_name ?? handle ?? "anon";
  const when = row.shared_at ?? row.settled_at;

  const inner = (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/3 focus-visible:outline-none focus-visible:bg-white/5">
      <span className="flex items-center gap-3 min-w-0">
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tones[row.status]}`}
        >
          {row.status === "void" ? "refund" : row.status}
        </span>
        <span className="shrink-0 rounded-full bg-primary/12 text-primary border border-primary/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest">
          {row.pick_count}× {row.mode}
        </span>
        <span className="truncate text-sm font-medium">{display}</span>
        {handle ? (
          <span className="truncate text-[11px] text-foreground/45 font-mono">
            @{handle}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-3 text-xs font-mono tabular-nums shrink-0">
        <span className="text-foreground/55">
          <span className="text-emerald-300">{row.legs_won}</span>
          /
          <span className="text-rose-300">{row.legs_lost}</span>
        </span>
        <span className={`font-semibold text-sm ${scoreTone}`}>
          {sign}
          {row.score.toFixed(0)}
        </span>
        {when ? (
          <time
            dateTime={when}
            className="hidden sm:inline text-foreground/45"
          >
            {new Date(when).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </time>
        ) : null}
      </span>
    </div>
  );

  if (handle) {
    return (
      <Link href={`/bros/${handle}`} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
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
              {settled} of {totalPredictions} settled · +1.0 / −1.0 ledger
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
  const playerShape = predictionShape?.player
    ? Array.isArray(predictionShape.player)
      ? predictionShape.player[0] ?? null
      : predictionShape.player
    : null;
  const teamShape = playerShape?.team
    ? Array.isArray(playerShape.team)
      ? playerShape.team[0] ?? null
      : playerShape.team
    : null;

  const playerId = playerShape?.id ?? predictionShape?.player_id ?? null;
  const playerName = playerShape
    ? `${playerShape.first_name} ${playerShape.last_name}`
    : null;
  const teamAbbr = teamShape?.abbreviation ?? null;
  const pickSide = predictionShape?.pick;
  const line = predictionShape?.line != null ? Number(predictionShape.line) : null;
  const market = predictionShape?.market ?? null;
  const propLabel =
    pickSide && line != null && market
      ? `${pickSide === "over" ? "OVER" : "UNDER"} ${line} ${marketLabel(market).toUpperCase()}`
      : null;

  const href = playerId ? `/players/${playerId}` : "/";
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/3 focus-visible:outline-none focus-visible:bg-white/5"
    >
      <span className="flex items-center gap-3 shrink-0">
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tones[row.outcome]}`}
        >
          {row.outcome}
        </span>
        <span className="font-mono tabular-nums text-sm text-foreground/80">
          {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
        </span>
      </span>

      {playerName || propLabel ? (
        <span className="hidden sm:flex items-center gap-2 min-w-0 flex-1 px-3">
          {playerName ? (
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-sm font-medium text-foreground/90">
                {playerName}
              </span>
              {teamAbbr ? (
                <span className="shrink-0 rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-foreground/55">
                  {teamAbbr}
                </span>
              ) : null}
            </span>
          ) : null}
          {playerName && propLabel ? (
            <span className="text-foreground/25 shrink-0">·</span>
          ) : null}
          {propLabel ? (
            <span className="shrink-0 font-mono text-xs uppercase tracking-wide text-primary/90 tabular-nums">
              {propLabel}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="hidden sm:block flex-1" aria-hidden />
      )}

      <span className="flex items-center gap-3 text-xs text-foreground/55 shrink-0">
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
