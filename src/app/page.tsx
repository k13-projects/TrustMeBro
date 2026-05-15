import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import { teamColors } from "@/lib/sports/nba/branding";
import { generateCombos } from "@/lib/analysis/combos";
import type { Prediction } from "@/lib/analysis/types";
import { ComboCard } from "@/components/ComboCard";
import { ConfidenceRing } from "@/components/ConfidenceRing";
import { DatePill } from "@/components/DatePill";
import { JerseyChip } from "@/components/JerseyChip";
import { marketLabel } from "@/components/MarketLabel";
import { PickRow } from "@/components/PickRow";
import { PickSideTag } from "@/components/PickSideTag";
import { PlayButton } from "@/components/PlayButton";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { TeamBadge } from "@/components/TeamBadge";
import type { PredictionRow, TeamLite } from "@/components/types";

export const revalidate = 30;

type PageProps = {
  searchParams: Promise<{ date?: string }>;
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
        "id, game_id, player_id, market, line, pick, projection, confidence, is_bet_of_the_day, reasoning, player:players!inner(id, first_name, last_name, team_id, position, jersey_number)",
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
    ((teams ?? []) as TeamLite[]).map((t) => [t.id, t] as const),
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const playedSet = new Set<string>();
  if (user && predictions.length > 0) {
    const { data: userBets } = await supabase
      .from("user_bets")
      .select("prediction_id")
      .eq("user_id", user.id)
      .in(
        "prediction_id",
        predictions.map((p) => p.id),
      );
    for (const ub of userBets ?? []) playedSet.add(ub.prediction_id);
  }
  const isSignedIn = !!user;

  const playerIdsWithPicks = Array.from(
    new Set(predictions.map((p) => p.player_id)),
  );
  const patternKeys = new Set<string>();
  if (playerIdsWithPicks.length > 0) {
    const { data: patternRows } = await supabase
      .from("patterns")
      .select("player_id, market")
      .in("player_id", playerIdsWithPicks);
    for (const row of (patternRows ?? []) as Array<{
      player_id: number;
      market: string | null;
    }>) {
      patternKeys.add(`${row.player_id}:${row.market ?? ""}`);
    }
  }
  const hasPatternFor = (p: PredictionRow) =>
    patternKeys.has(`${p.player_id}:${p.market}`);

  const botd = predictions.find((p) => p.is_bet_of_the_day) ?? null;
  const others = botd ? predictions.filter((p) => p.id !== botd.id) : predictions;

  const combos = generateCombos(
    predictions as unknown as Prediction[],
    { minConfidence: 80, size: 2, max: 5 },
  ).map((c) => ({
    ...c,
    picks: c.picks as unknown as PredictionRow[],
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            NBA · Today
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
            Today&apos;s Picks
          </h1>
          <p className="text-sm text-foreground/55 mt-1">
            {predictions.length > 0
              ? `${predictions.length} picks for ${date}`
              : `No picks for ${date} yet`}
          </p>
        </div>
        <nav className="glass rounded-full flex items-center gap-1 p-1 text-sm">
          <DatePill href={`/?date=${prev}`} label={`← ${prev}`} />
          <DatePill href="/" label="Today" emphasis />
          <DatePill href={`/?date=${next}`} label={`${next} →`} />
        </nav>
      </header>

      {predictions.length === 0 ? (
        <EmptyState date={date} hasGames={gameIds.length > 0} />
      ) : (
        <>
          {botd ? (
            <BetOfTheDayCard
              prediction={botd}
              team={teamById.get(botd.player.team_id ?? -1) ?? null}
              played={playedSet.has(botd.id)}
              isSignedIn={isSignedIn}
            />
          ) : null}

          {combos.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
                  Suggested Combos
                </h2>
                <span className="text-[10px] uppercase tracking-widest text-foreground/45">
                  PrizePicks-ready
                </span>
              </div>
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {combos.map((combo) => (
                  <ComboCard
                    key={combo.picks.map((p) => p.id).join("|")}
                    combo={combo}
                    teamById={teamById}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
              All Picks
            </h2>
            <div className="grid gap-3">
              {others.map((p) => (
                <PickRow
                  key={p.id}
                  prediction={p}
                  team={teamById.get(p.player.team_id ?? -1) ?? null}
                  hasPattern={hasPatternFor(p)}
                  trailing={
                    <PlayButton
                      predictionId={p.id}
                      initialPlayed={playedSet.has(p.id)}
                      isSignedIn={isSignedIn}
                    />
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

function BetOfTheDayCard({
  prediction,
  team,
  played,
  isSignedIn,
}: {
  prediction: PredictionRow;
  team: TeamLite | null;
  played: boolean;
  isSignedIn: boolean;
}) {
  const colors = teamColors(team?.abbreviation);
  const market = marketLabel(prediction.market);
  const name = `${prediction.player.first_name} ${prediction.player.last_name}`;

  return (
    <section className="relative overflow-hidden rounded-3xl glass-strong glass-sheen grain">
      <div
        aria-hidden
        className="absolute -inset-px opacity-50 pointer-events-none"
        style={{
          background: `radial-gradient(40rem 22rem at 12% 30%, ${colors.primary}66, transparent 60%), radial-gradient(30rem 18rem at 90% 80%, ${colors.secondary}55, transparent 60%)`,
        }}
      />
      <div className="relative p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2 text-amber-300">
          <span aria-hidden className="text-base">★</span>
          <h2 className="text-[11px] font-medium tracking-[0.22em] uppercase">
            Bet of the Day
          </h2>
        </div>

        <div className="flex items-start gap-6 flex-wrap">
          <PlayerAvatar
            playerId={prediction.player.id}
            firstName={prediction.player.first_name}
            lastName={prediction.player.last_name}
            abbreviation={team?.abbreviation ?? ""}
            size={120}
          />
          <div className="flex-1 min-w-[200px] space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <TeamBadge team={team} size={28} />
                <span className="text-xs text-foreground/65">
                  {team?.full_name ?? ""}
                </span>
                <JerseyChip number={prediction.player.jersey_number} />
                {prediction.player.position ? (
                  <span className="text-[11px] text-foreground/50 font-mono uppercase">
                    {prediction.player.position}
                  </span>
                ) : null}
              </div>
              <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                {name}
              </h3>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <PickSideTag side={prediction.pick} />
              <span className="text-2xl font-semibold tabular-nums">
                {prediction.line}
              </span>
              <span className="text-foreground/65">{market}</span>
            </div>
            <p className="text-xs text-foreground/55">
              Engine projection:{" "}
              <span className="font-mono tabular-nums text-foreground/90">
                {prediction.projection.toFixed(1)}
              </span>
            </p>
          </div>
          <ConfidenceRing score={prediction.confidence} />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <ReasoningPanel reasoning={prediction.reasoning} />
        </div>
        <div>
          <PlayButton
            predictionId={prediction.id}
            initialPlayed={played}
            isSignedIn={isSignedIn}
          />
        </div>
      </div>
    </section>
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
    <div className="glass glass-sheen rounded-2xl p-8 text-center space-y-2">
      <p className="text-foreground/70">
        {hasGames
          ? `Games are scheduled for ${date}. Picks will appear here shortly — check back soon.`
          : `No NBA games (and no picks) for ${date}.`}
      </p>
      <p className="text-xs text-foreground/45">
        Picks refresh automatically each day.
      </p>
    </div>
  );
}
