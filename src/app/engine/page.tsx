import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidIsoDate, todayIsoDate, isoDateOffset } from "@/lib/date";
import { ConfidencePill } from "@/components/ConfidencePill";
import { DatePill } from "@/components/DatePill";
import { marketLabel } from "@/components/MarketLabel";
import { PickSideTag } from "@/components/PickSideTag";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { TeamBadge } from "@/components/TeamBadge";
import type { TeamLite } from "@/components/types";

export const revalidate = 30;

const ALLOWED_STATUS = new Set(["all", "won", "lost", "void", "pending"]);
type StatusFilter = "all" | "won" | "lost" | "void" | "pending";
type RowStatus = Exclude<StatusFilter, "all">;

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

export default async function EnginePage({ searchParams }: PageProps) {
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
  const { data: scoreRow } = await supabase
    .from("system_score")
    .select("score, wins, losses, voids, updated_at")
    .eq("id", true)
    .single();

  let query = supabase
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
  if (status !== "all") query = query.eq("status", status);
  const { data: rawRows } = await query;

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

  // Aggregate over the *unfiltered* set within the same date range so the
  // header reflects engine performance, not the current filter slice.
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
  const settled = counts.won + counts.lost;
  const hitRate = settled > 0 ? Math.round((counts.won / settled) * 100) : null;

  const scoreDisplay = Number(scoreRow?.score ?? 0);
  const tone =
    scoreDisplay > 0
      ? "text-emerald-300"
      : scoreDisplay < 0
        ? "text-rose-300"
        : "text-foreground";
  const sign = scoreDisplay > 0 ? "+" : "";

  function buildHref(over: { date?: string; status?: string; range?: number }) {
    const q = new URLSearchParams();
    q.set("date", over.date ?? date);
    q.set("status", over.status ?? status);
    q.set("range", String(over.range ?? rangeDays));
    return `/engine?${q.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            Engine History
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
            Picks vs. Reality
          </h1>
          <p className="text-sm text-foreground/55 mt-1">
            Every prediction the engine has made, with the actual stat from
            the box score after the game. This is what the score on{" "}
            <Link href="/score" className="underline underline-offset-2">/score</Link>{" "}
            is grading.
          </p>
        </div>
        <nav className="glass rounded-full flex items-center gap-1 p-1 text-sm">
          <DatePill href={buildHref({ date: isoDateOffset(date, -1) })} label={`← ${isoDateOffset(date, -1)}`} />
          <DatePill href={buildHref({ date: today })} label="Today" emphasis />
          <DatePill href={buildHref({ date: isoDateOffset(date, 1) })} label={`${isoDateOffset(date, 1)} →`} />
        </nav>
      </header>

      <section className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        <Stat label="Score" value={`${sign}${scoreDisplay.toFixed(1)}`} tone={tone} />
        <Stat label="In window" value={counts.total} />
        <Stat label="Settled" value={settled} />
        <Stat label="Hit rate" value={hitRate !== null ? `${hitRate}%` : "—"} />
        <Stat label="Pending" value={counts.pending} />
      </section>

      <section className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-foreground/55 mr-1">Range</span>
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
        <span className="text-[10px] uppercase tracking-widest text-foreground/55 ml-3 mr-1">Status</span>
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
      </section>

      {rows.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-foreground/55">
          No predictions for this window and status.
        </div>
      ) : (
        <section className="space-y-2">
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
        </section>
      )}
    </div>
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
      <div className="text-[10px] uppercase tracking-widest text-foreground/55">{label}</div>
      <div className={`font-mono tabular-nums text-xl font-semibold ${tone ?? ""}`}>
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
              <span className="text-amber-300 text-xs" aria-label="Bet of the day">★</span>
            ) : null}
            <span className="text-[10px] font-mono uppercase text-foreground/45">
              {row.game?.date ?? ""}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2 text-sm flex-wrap">
            <PickSideTag side={row.pick} />
            <span className="font-mono tabular-nums">{row.line}</span>
            <span className="text-foreground/60">{marketLabel(row.market)}</span>
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
          <span className={`text-[11px] font-mono tabular-nums ${deltaTone}`}>{delta}</span>
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
