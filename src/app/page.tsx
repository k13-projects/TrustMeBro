import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import type { Reasoning } from "@/lib/analysis/types";

export const revalidate = 30;

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

type PredictionRow = {
  id: string;
  game_id: number;
  player_id: number;
  market: string;
  line: number;
  pick: "over" | "under";
  projection: number;
  confidence: number;
  is_bet_of_the_day: boolean;
  reasoning: Reasoning;
  player: {
    id: number;
    first_name: string;
    last_name: string;
    team_id: number | null;
    position: string | null;
  };
};

const MARKET_LABEL: Record<string, string> = {
  points: "Points",
  rebounds: "Rebounds",
  assists: "Assists",
  threes_made: "3PT Made",
  minutes: "Minutes",
  steals: "Steals",
  blocks: "Blocks",
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = isValidIsoDate(params.date) ? params.date : todayIsoDate();
  const prev = isoDateOffset(date, -1);
  const next = isoDateOffset(date, 1);

  const supabase = await createSupabaseServerClient();

  const { data: games } = await supabase
    .from("games")
    .select("id, home_team_id, visitor_team_id, status")
    .eq("date", date);
  const gameIds = (games ?? []).map((g) => g.id);

  let predictions: PredictionRow[] = [];
  if (gameIds.length > 0) {
    const { data } = await supabase
      .from("predictions")
      .select(
        "id, game_id, player_id, market, line, pick, projection, confidence, is_bet_of_the_day, reasoning, player:players!inner(id, first_name, last_name, team_id, position)",
      )
      .in("game_id", gameIds)
      .order("is_bet_of_the_day", { ascending: false })
      .order("confidence", { ascending: false });
    predictions = (data ?? []) as unknown as PredictionRow[];
  }

  const teamIds = Array.from(
    new Set(
      predictions
        .map((p) => p.player.team_id)
        .filter((id): id is number => id !== null),
    ),
  );
  const { data: teams } = teamIds.length
    ? await supabase
        .from("teams")
        .select("id, abbreviation, full_name")
        .in("id", teamIds)
    : { data: [] };
  const teamById = new Map(
    (teams ?? []).map((t) => [t.id, t] as const),
  );

  const botd = predictions.find((p) => p.is_bet_of_the_day) ?? null;
  const others = botd ? predictions.filter((p) => p.id !== botd.id) : predictions;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Today&apos;s Picks
          </h1>
          <p className="text-sm text-foreground/60 mt-1">
            {predictions.length > 0
              ? `${predictions.length} picks for ${date}`
              : `No picks for ${date} yet`}
          </p>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href={`/?date=${prev}`}
            className="rounded border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            ← {prev}
          </Link>
          <Link
            href="/"
            className="rounded border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            Today
          </Link>
          <Link
            href={`/?date=${next}`}
            className="rounded border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            {next} →
          </Link>
        </nav>
      </header>

      {predictions.length === 0 ? (
        <EmptyState date={date} hasGames={gameIds.length > 0} />
      ) : (
        <>
          {botd ? (
            <BetOfTheDayCard
              prediction={botd}
              teamAbbrev={
                teamById.get(botd.player.team_id ?? -1)?.abbreviation ?? ""
              }
            />
          ) : null}

          <section className="space-y-3">
            <h2 className="text-xs font-medium tracking-widest uppercase text-foreground/50">
              All Picks
            </h2>
            <div className="grid gap-2">
              {others.map((p) => (
                <PickRow
                  key={p.id}
                  prediction={p}
                  teamAbbrev={
                    teamById.get(p.player.team_id ?? -1)?.abbreviation ?? ""
                  }
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const tone =
    score >= 90
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : score >= 75
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
        : "bg-foreground/5 text-foreground/60 border-foreground/15";
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-mono tabular-nums ${tone}`}
    >
      {Math.round(score)}
    </span>
  );
}

function PickHeadline({
  prediction,
  teamAbbrev,
}: {
  prediction: PredictionRow;
  teamAbbrev: string;
}) {
  const name = `${prediction.player.first_name} ${prediction.player.last_name}`;
  const market = MARKET_LABEL[prediction.market] ?? prediction.market;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{name}</span>
        {teamAbbrev ? (
          <span className="text-xs text-foreground/50 font-mono">
            {teamAbbrev}
          </span>
        ) : null}
        {prediction.player.position ? (
          <span className="text-xs text-foreground/40">
            {prediction.player.position}
          </span>
        ) : null}
      </div>
      <div className="text-sm mt-0.5">
        <span className="uppercase tracking-wide text-foreground/60 text-xs">
          {prediction.pick}
        </span>{" "}
        <span className="font-mono tabular-nums">{prediction.line}</span>{" "}
        <span className="text-foreground/60">{market}</span>
      </div>
    </div>
  );
}

function BetOfTheDayCard({
  prediction,
  teamAbbrev,
}: {
  prediction: PredictionRow;
  teamAbbrev: string;
}) {
  return (
    <section className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-5 space-y-4">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        <span aria-hidden>★</span>
        <h2 className="text-xs font-medium tracking-widest uppercase">
          Bet of the Day
        </h2>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <PickHeadline prediction={prediction} teamAbbrev={teamAbbrev} />
          <p className="text-xs text-foreground/60">
            Projection:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {prediction.projection.toFixed(1)}
            </span>
          </p>
        </div>
        <ConfidenceBadge score={prediction.confidence} />
      </div>

      <ReasoningPanel reasoning={prediction.reasoning} />
    </section>
  );
}

function PickRow({
  prediction,
  teamAbbrev,
}: {
  prediction: PredictionRow;
  teamAbbrev: string;
}) {
  return (
    <details className="rounded-lg border border-black/10 dark:border-white/10 bg-background open:border-black/20 dark:open:border-white/20">
      <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-3">
        <PickHeadline prediction={prediction} teamAbbrev={teamAbbrev} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground/60 font-mono tabular-nums">
            {prediction.projection.toFixed(1)}
          </span>
          <ConfidenceBadge score={prediction.confidence} />
        </div>
      </summary>
      <div className="px-3 pb-3 -mt-1">
        <ReasoningPanel reasoning={prediction.reasoning} />
      </div>
    </details>
  );
}

function ReasoningPanel({ reasoning }: { reasoning: Reasoning }) {
  if (!reasoning?.checks?.length) return null;
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-background/50 divide-y divide-black/5 dark:divide-white/5 text-xs">
      {reasoning.checks.map((c, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-3 py-1.5"
        >
          <span className="flex items-center gap-2">
            <span
              className={c.passed ? "text-emerald-500" : "text-foreground/30"}
              aria-hidden
            >
              {c.passed ? "✓" : "·"}
            </span>
            <span className={c.passed ? "" : "text-foreground/50"}>
              {c.label}
            </span>
          </span>
          <span className="font-mono tabular-nums text-foreground/60">
            {c.value.toFixed(1)} vs {c.target}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  date,
  hasGames,
}: {
  date: string;
  hasGames: boolean;
}) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-8 text-center space-y-2">
      <p className="text-foreground/70">
        {hasGames
          ? `Games are scheduled for ${date} but no predictions have been generated yet.`
          : `No NBA games (and no picks) for ${date}.`}
      </p>
      {hasGames ? (
        <p className="text-xs text-foreground/50 font-mono">
          Run: <code>/api/cron/generate-predictions?date={date}</code> (with
          the cron Bearer token)
        </p>
      ) : null}
    </div>
  );
}
