import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import { teamColors } from "@/lib/sports/nba/branding";
import { generateCombos } from "@/lib/analysis/combos";
import { loadPayoutMap } from "@/lib/analysis/payouts";
import type { Prediction } from "@/lib/analysis/types";
import { AddToCouponButton } from "@/components/cart/AddToCouponButton";
import { ComboCard } from "@/components/ComboCard";
import { ConfidenceRing } from "@/components/ConfidenceRing";
import { DatePill } from "@/components/DatePill";
import { JerseyChip } from "@/components/JerseyChip";
import { marketLabel } from "@/components/MarketLabel";
import { PickRow } from "@/components/PickRow";
import { PicksFilterBar } from "@/components/PicksFilterBar";
import { PickSideTag } from "@/components/PickSideTag";
import { PlayButton } from "@/components/PlayButton";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { TeamBadge } from "@/components/TeamBadge";
import type { PredictionRow, TeamLite } from "@/components/types";

import { BrushText } from "@/components/site/BrushText";
import { Hero } from "@/components/site/Hero";
import { PickCard } from "@/components/site/PickCard";
import { StatStrip } from "@/components/site/StatStrip";
import { PillarRow } from "@/components/site/PillarRow";
import { WinnersClub } from "@/components/site/WinnersClub";
import { PricingTiers } from "@/components/site/PricingTiers";
import { SectionHeading } from "@/components/site/SectionHeading";
import { StatComparisonViz } from "@/components/site/StatComparisonViz";
import { getEngineStats } from "@/lib/scoring/stats";

export const revalidate = 30;

const ALLOWED_MARKETS = new Set([
  "points",
  "rebounds",
  "assists",
  "threes_made",
  "minutes",
  "pra",
  "steals",
  "blocks",
]);

type PageProps = {
  searchParams: Promise<{ date?: string; market?: string; min?: string }>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = isValidIsoDate(params.date) ? params.date : todayIsoDate();
  const marketFilter =
    params.market && ALLOWED_MARKETS.has(params.market) ? params.market : null;
  const minConfidenceFilter = Number.isFinite(Number(params.min))
    ? Math.max(0, Math.min(100, Number(params.min)))
    : 0;
  const prev = isoDateOffset(date, -1);
  const next = isoDateOffset(date, 1);

  const supabase = await createSupabaseServerClient();
  const engineStats = await getEngineStats();

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
  const allOthers = botd
    ? predictions.filter((p) => p.id !== botd.id)
    : predictions;

  const filteredOthers = allOthers.filter((p) => {
    if (marketFilter && p.market !== marketFilter) return false;
    if (minConfidenceFilter > 0 && p.confidence < minConfidenceFilter)
      return false;
    return true;
  });
  const filtersActive = marketFilter !== null || minConfidenceFilter > 0;

  const payouts = await loadPayoutMap();
  const combos = generateCombos(
    predictions as unknown as Prediction[],
    { minConfidence: 80, size: 2, max: 5, payouts },
  ).map((c) => ({
    ...c,
    picks: c.picks as unknown as PredictionRow[],
  }));

  return (
    <div className="fade-up">
      <Hero stats={engineStats} />
      <StatStrip stats={engineStats} />

      <section
        id="picks"
        className="mx-auto max-w-7xl px-4 sm:px-6 py-16 space-y-8 scroll-mt-24"
      >
        <SectionHeading
          eyebrow="NBA · Today"
          title={
            <>
              Today&apos;s Top <BrushText className="text-[1.06em]">Picks</BrushText>
            </>
          }
          trailing={
            <nav className="card-tmb rounded-full flex items-center gap-1 p-1 text-sm">
              <DatePill href={`/?date=${prev}`} label={`← ${prev}`} />
              <DatePill href="/" label="Today" emphasis />
              <DatePill href={`/?date=${next}`} label={`${next} →`} />
            </nav>
          }
        />
        <p className="text-sm text-muted-foreground -mt-3">
          All picks are{" "}
          <span className="text-foreground font-semibold">data-driven.</span>{" "}
          Not opinions.
          {predictions.length > 0 ? ` ${predictions.length} picks for ${date}.` : ""}
        </p>

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
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Suggested Combos
                  </h3>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
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

            <PicksFilterBar
              totalCount={allOthers.length}
              filteredCount={filteredOthers.length}
            />

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {filtersActive ? "Filtered Picks" : "Sharper Picks"}
                </h3>
                {filteredOthers.length > 3 ? (
                  <Link
                    href={`/?date=${date}&all=1`}
                    className="text-xs font-medium uppercase tracking-[0.18em] text-primary hover:text-[var(--primary-hover)]"
                  >
                    View All ({filteredOthers.length}) →
                  </Link>
                ) : null}
              </div>
              {filteredOthers.length === 0 ? (
                <div className="card-tmb p-6 text-sm text-muted-foreground text-center">
                  No picks match your filters. Try widening the market or lowering
                  the confidence threshold.
                </div>
              ) : null}
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredOthers.slice(0, 3).map((p, i) => (
                  <PickCard
                    key={p.id}
                    prediction={p}
                    team={teamById.get(p.player.team_id ?? -1) ?? null}
                    free={i === 0 && !isSignedIn}
                    locked={!(i === 0 && !isSignedIn)}
                    odds={"-110"}
                    gameTimeLabel={undefined}
                  />
                ))}
              </div>
              {filteredOthers.length > 3 ? (
                <details className="card-tmb rounded-2xl overflow-hidden">
                  <summary className="cursor-pointer select-none px-5 py-3.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground/85 list-none flex items-center justify-between">
                    <span>
                      Show the full slate
                      <span className="text-foreground/60 ml-2">
                        ({filteredOthers.length - 3} more)
                      </span>
                    </span>
                    <span aria-hidden className="text-primary">+</span>
                  </summary>
                  <div className="border-t border-border/60 p-4 grid gap-3">
                    {filteredOthers.slice(3).map((p) => (
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
                </details>
              ) : null}
            </section>
          </>
        )}
      </section>

      <PillarRow />
      <WinnersClub stats={engineStats} />
      <PricingTiers />
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
    <section className="relative overflow-hidden rounded-3xl card-tmb grain ring-1 ring-primary/30 shadow-[0_0_60px_-12px_rgba(255,184,0,0.35)]">
      <div
        aria-hidden
        className="absolute -inset-px opacity-90 pointer-events-none"
        style={{
          background: `radial-gradient(48rem 26rem at 12% 25%, ${colors.primary}66, transparent 60%), radial-gradient(36rem 22rem at 92% 85%, ${colors.secondary}55, transparent 62%), radial-gradient(28rem 18rem at 50% 0%, rgba(255, 184, 0, 0.22), transparent 70%)`,
        }}
      />
      <div
        aria-hidden
        className="absolute top-4 right-4 size-24 rounded-full bg-primary/15 blur-2xl pointer-events-none"
      />
      <div className="relative p-6 sm:p-8 space-y-6">
        <h2 className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 border border-primary/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            <span aria-hidden className="text-sm leading-none">★</span>
            Bet of the Day
          </span>
        </h2>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] items-start">
          <div className="space-y-5">
            <div className="flex items-start gap-5 flex-wrap">
              <PlayerAvatar
                playerId={prediction.player.id}
                firstName={prediction.player.first_name}
                lastName={prediction.player.last_name}
                abbreviation={team?.abbreviation ?? ""}
                size={108}
              />
              <div className="flex-1 min-w-[200px] space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TeamBadge team={team} size={28} />
                    <span className="text-xs text-muted-foreground">
                      {team?.full_name ?? ""}
                    </span>
                    <JerseyChip number={prediction.player.jersey_number} />
                    {prediction.player.position ? (
                      <span className="text-[11px] text-muted-foreground font-mono uppercase">
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
                  <span className="font-numeric text-3xl tabular-nums">
                    {prediction.line}
                  </span>
                  <span className="text-muted-foreground">{market}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Engine projection:{" "}
                  <span className="font-mono tabular-nums text-foreground/90">
                    {prediction.projection.toFixed(1)}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ConfidenceRing score={prediction.confidence} />
              <ReasoningPanel reasoning={prediction.reasoning} />
            </div>
          </div>

          <div className="card-tmb p-4 sm:p-5 bg-background/40">
            <StatComparisonViz
              checks={prediction.reasoning?.checks ?? []}
              line={prediction.line}
              projection={prediction.projection}
              pick={prediction.pick}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PlayButton
            predictionId={prediction.id}
            initialPlayed={played}
            isSignedIn={isSignedIn}
          />
          <AddToCouponButton
            pick={{
              prediction_id: prediction.id,
              game_id: prediction.game_id,
              player_id: prediction.player_id,
              player_first_name: prediction.player.first_name,
              player_last_name: prediction.player.last_name,
              team_id: prediction.player.team_id,
              team_abbreviation: team?.abbreviation ?? null,
              market: prediction.market,
              line: prediction.line,
              pick: prediction.pick,
              confidence: prediction.confidence,
              jersey_number: prediction.player.jersey_number,
            }}
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
    <div className="card-tmb p-10 text-center space-y-2">
      <p className="text-foreground/80">
        {hasGames
          ? `Games are scheduled for ${date}. Picks will appear here shortly — check back soon.`
          : `No NBA games (and no picks) for ${date}.`}
      </p>
      <p className="text-xs text-muted-foreground">
        Picks refresh automatically each day.
      </p>
    </div>
  );
}
