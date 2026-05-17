import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidIsoDate, todayIsoDate, isoDateOffset } from "@/lib/date";
import { ConfidencePill } from "@/components/ConfidencePill";
import { DatePill } from "@/components/DatePill";
import { marketLabel } from "@/components/MarketLabel";
import { PickSideTag } from "@/components/PickSideTag";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TeamBadge } from "@/components/TeamBadge";
import { ScoreChart, type ScorePoint } from "@/components/ScoreChart";
import type { TeamLite } from "@/components/types";
import {
  getCouponLedger,
  type CouponLedger,
  type CouponLedgerRow,
} from "@/lib/scoring/coupons";

export const revalidate = 30;

const ALLOWED_STATUS = new Set(["all", "won", "lost", "void", "pending"]);
type StatusFilter = "all" | "won" | "lost" | "void" | "pending";
type RowStatus = Exclude<StatusFilter, "all">;

type SystemScore = {
  id: boolean;
  score: number | string;
  wins: number;
  losses: number;
  voids: number;
  updated_at: string;
};

type Row = {
  id: string;
  game_id: number;
  player_id: number;
  market: string;
  line: number;
  pick: "over" | "under";
  projection: number;
  confidence: number;
  is_bet_of_the_day: boolean;
  status: RowStatus;
  result_value: number | null;
  settled_at: string | null;
  generated_at: string;
  player: {
    id: number;
    first_name: string;
    last_name: string;
    team_id: number | null;
    jersey_number: string | null;
  } | null;
  game: { date: string; status: string } | null;
};

type PageProps = {
  searchParams: Promise<{
    date?: string;
    status?: string;
    range?: string;
  }>;
};

export default async function ScorecardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = todayIsoDate();
  const date = isValidIsoDate(params.date) ? params.date : today;
  const status: StatusFilter =
    params.status && ALLOWED_STATUS.has(params.status)
      ? (params.status as StatusFilter)
      : "all";
  const rangeDays = (() => {
    const n = Number(params.range);
    if (n === 1 || n === 7 || n === 30) return n;
    return 7;
  })();
  const startDate = isoDateOffset(date, -(rangeDays - 1));

  const supabase = await createSupabaseServerClient();

  const [
    { data: scoreRow },
    { data: history },
    { data: predictionsAll },
    couponLedger,
  ] = await Promise.all([
    supabase.from("system_score").select("*").eq("id", true).single(),
    supabase
      .from("system_score_history")
      .select("delta, outcome, score_after, recorded_at")
      .order("recorded_at", { ascending: true })
      .limit(500),
    supabase.from("predictions").select("status"),
    getCouponLedger({ recentLimit: 15 }),
  ]);

  let pickQuery = supabase
    .from("predictions")
    .select(
      `id, game_id, player_id, market, line, pick, projection, confidence,
       is_bet_of_the_day, status, result_value, settled_at, generated_at,
       player:players!inner(id, first_name, last_name, team_id, jersey_number),
       game:games!inner(date, status)`,
    )
    .gte("generated_at", `${startDate}T00:00:00Z`)
    .lte("generated_at", `${date}T23:59:59Z`)
    .order("generated_at", { ascending: false })
    .limit(500);
  if (status !== "all") pickQuery = pickQuery.eq("status", status);
  const { data: rawRows } = await pickQuery;

  const rows = ((rawRows ?? []) as unknown as Row[]).map((r) => {
    const player = Array.isArray(r.player) ? r.player[0] ?? null : r.player;
    const game = Array.isArray(r.game) ? r.game[0] ?? null : r.game;
    return { ...r, player, game } as Row;
  });

  const teamIds = Array.from(
    new Set(
      rows
        .map((r) => r.player?.team_id)
        .filter((id): id is number => id != null),
    ),
  );
  const { data: teams } = teamIds.length
    ? await supabase
        .from("teams")
        .select("id, abbreviation, full_name")
        .in("id", teamIds)
    : { data: [] };
  const teamById = new Map<number, TeamLite>(
    ((teams ?? []) as TeamLite[]).map((t) => [t.id, t]),
  );

  const score = Number((scoreRow as SystemScore | null)?.score ?? 0);
  const wins = (scoreRow as SystemScore | null)?.wins ?? 0;
  const losses = (scoreRow as SystemScore | null)?.losses ?? 0;
  const voids =
    (predictionsAll ?? []).filter(
      (p: { status: string }) => p.status === "void",
    ).length;
  const pending =
    (predictionsAll ?? []).filter(
      (p: { status: string }) => p.status === "pending",
    ).length;

  const chartPoints: ScorePoint[] = (history ?? []).map(
    (r: {
      delta: number | string;
      outcome: "won" | "lost" | "void";
      score_after: number | string;
      recorded_at: string;
    }) => ({
      scoreAfter: Number(r.score_after),
      delta: Number(r.delta),
      outcome: r.outcome,
      recordedAt: r.recorded_at,
    }),
  );

  const { data: allInRange } = await supabase
    .from("predictions")
    .select("status")
    .gte("generated_at", `${startDate}T00:00:00Z`)
    .lte("generated_at", `${date}T23:59:59Z`);
  const counts = (allInRange ?? []).reduce(
    (acc, r: { status: string }) => {
      const s = r.status as RowStatus;
      if (s === "won" || s === "lost" || s === "void" || s === "pending") {
        acc[s] = (acc[s] ?? 0) + 1;
      }
      acc.total++;
      return acc;
    },
    { total: 0, won: 0, lost: 0, void: 0, pending: 0 } as Record<
      "total" | RowStatus,
      number
    >,
  );
  const windowSettled = counts.won + counts.lost;
  const windowHitRate =
    windowSettled > 0 ? Math.round((counts.won / windowSettled) * 100) : null;

  function buildHref(over: { date?: string; status?: string; range?: number }) {
    const q = new URLSearchParams();
    q.set("date", over.date ?? date);
    q.set("status", over.status ?? status);
    q.set("range", String(over.range ?? rangeDays));
    return `/scorecard?${q.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-12">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          System Scorecard
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
          subtitle="+1.0 per hit, −1.0 per miss. Reset 2026-05-14 — every settlement below is real."
        />

        <EngineHero
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
      </section>

      <section className="space-y-5">
        <SectionHeader
          kicker="Picks vs. Reality"
          title="Every pick the engine has made"
          subtitle="The actual stat from the box score after the game — this is what the score above is grading."
        />

        <nav className="glass rounded-full inline-flex items-center gap-1 p-1 text-sm">
          <DatePill
            href={buildHref({ date: isoDateOffset(date, -1) })}
            label={`← ${isoDateOffset(date, -1)}`}
          />
          <DatePill href={buildHref({ date: today })} label="Today" emphasis />
          <DatePill
            href={buildHref({ date: isoDateOffset(date, 1) })}
            label={`${isoDateOffset(date, 1)} →`}
          />
        </nav>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <Stat label="In window" value={counts.total} />
          <Stat label="Settled" value={windowSettled} />
          <Stat
            label="Hit rate"
            value={windowHitRate !== null ? `${windowHitRate}%` : "—"}
          />
          <Stat label="Pending" value={counts.pending} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-foreground/55 mr-1">
            Range
          </span>
          {[1, 7, 30].map((r) => (
            <Link
              key={r}
              href={buildHref({ range: r })}
              className={`rounded-full border px-3 py-1 text-xs ${
                rangeDays === r
                  ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                  : "border-white/10 bg-white/5 text-foreground/65 hover:bg-white/8"
              }`}
            >
              {r === 1 ? "1d" : r === 7 ? "7d" : "30d"}
            </Link>
          ))}
          <span className="text-[10px] uppercase tracking-widest text-foreground/55 ml-3 mr-1">
            Status
          </span>
          {(["all", "won", "lost", "void", "pending"] as const).map((s) => (
            <Link
              key={s}
              href={buildHref({ status: s })}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${
                status === s
                  ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                  : "border-white/10 bg-white/5 text-foreground/65 hover:bg-white/8"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-sm text-foreground/55">
            No predictions for this window and status.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <PredictionRow
                key={r.id}
                row={r}
                team={
                  r.player?.team_id != null
                    ? teamById.get(r.player.team_id) ?? null
                    : null
                }
              />
            ))}
          </div>
        )}
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
              that misses bleeds{" "}
              <span className="text-foreground/85">−1 per missed leg</span>.
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-foreground/55">
        {label}
      </div>
      <div
        className={`font-mono tabular-nums text-xl font-semibold ${tone ?? ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function PredictionRow({ row, team }: { row: Row; team: TeamLite | null }) {
  const player = row.player;
  if (!player) return null;
  const name = `${player.first_name} ${player.last_name}`;
  const outcomeTones = {
    pending: "bg-white/5 text-foreground/55 border-white/10",
    won: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    lost: "bg-rose-400/15 text-rose-300 border-rose-400/30",
    void: "bg-white/5 text-foreground/45 border-white/10",
  } as const;
  const delta =
    row.status === "won" ? "+1.0" : row.status === "lost" ? "−1.0" : "0";
  const deltaTone =
    row.status === "won"
      ? "text-emerald-300"
      : row.status === "lost"
        ? "text-rose-300"
        : "text-foreground/45";

  return (
    <Link
      href={`/games/${row.game_id}`}
      className="block glass glass-sheen rounded-2xl p-3 sm:p-4 hover:bg-white/3 transition-colors"
    >
      <div className="flex items-center gap-4">
        <PlayerAvatar
          playerId={player.id}
          firstName={player.first_name}
          lastName={player.last_name}
          abbreviation={team?.abbreviation ?? ""}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{name}</span>
            <TeamBadge team={team} size={16} />
            {row.is_bet_of_the_day ? (
              <span
                className="text-amber-300 text-xs"
                aria-label="Bet of the day"
              >
                ★
              </span>
            ) : null}
            <span className="text-[10px] font-mono uppercase text-foreground/45">
              {row.game?.date ?? ""}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2 text-sm flex-wrap">
            <PickSideTag side={row.pick} />
            <span className="font-mono tabular-nums">{row.line}</span>
            <span className="text-foreground/60">
              {marketLabel(row.market)}
            </span>
            <span className="text-xs text-foreground/45 font-mono">
              · projected {row.projection.toFixed(1)}
            </span>
            {row.result_value !== null ? (
              <span className="text-xs text-foreground/55 font-mono">
                · actual {row.result_value}
              </span>
            ) : null}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1">
          <ConfidencePill score={row.confidence} />
          <span className={`text-[11px] font-mono tabular-nums ${deltaTone}`}>
            {delta}
          </span>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium ${outcomeTones[row.status]}`}
        >
          {row.status}
        </span>
      </div>
    </Link>
  );
}

function EngineHero({
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
            <div
              className={`text-6xl sm:text-7xl font-semibold tabular-nums ${tone}`}
            >
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
            <div
              className={`text-6xl sm:text-7xl font-semibold tabular-nums ${tone}`}
            >
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
      <div
        className={`text-3xl font-semibold font-mono tabular-nums ${tone}`}
      >
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
      <div className="text-[10px] uppercase tracking-widest opacity-80">
        {label}
      </div>
      <div className="font-mono tabular-nums text-2xl font-semibold">
        {value}
      </div>
    </div>
  );
}
