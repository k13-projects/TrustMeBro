import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import { teamColors } from "@/lib/sports/nba/branding";
import { generateCombos } from "@/lib/analysis/combos";
import { loadPayoutMap } from "@/lib/analysis/payouts";
import { pickFeaturedPlayers } from "@/lib/analysis/featured-players";
import type { Prediction } from "@/lib/analysis/types";
import { AddToCouponButton } from "@/components/cart/AddToCouponButton";
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

import { InsightChip, type InsightHint } from "@/components/InsightChip";
import { Hero } from "@/components/site/Hero";
import { COMBO_TIERS, MoneyCombos } from "@/components/site/MoneyCombos";
import { PickCard } from "@/components/site/PickCard";
import { PillarRow } from "@/components/site/PillarRow";
import { SectionHeading } from "@/components/site/SectionHeading";
import { StatComparisonViz } from "@/components/site/StatComparisonViz";
import { TodaysSlate } from "@/components/site/TodaysSlate";
import { TrendingPlayers } from "@/components/site/TrendingPlayers";
import { WinnersClub } from "@/components/site/WinnersClub";
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
  const featuredPlayers = await pickFeaturedPlayers(date, 6);

  const { data: gamesRaw } = await supabase
    .from("games")
    .select("id, date, datetime, status, home_team_id, visitor_team_id")
    .eq("date", date);
  const games = (gamesRaw ?? []).map((g) => ({
    id: g.id,
    date: g.date,
    datetime: g.datetime,
    status: g.status,
    home_team_id: g.home_team_id,
    visitor_team_id: g.visitor_team_id,
  }));
  const gameIds = games.map((g) => g.id);

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

  // Team IDs we need to hydrate: featured players' teams + every team that
  // appears on a game card or a prediction. One round-trip covers them all.
  const teamIds = new Set<number>();
  for (const g of games) {
    teamIds.add(g.home_team_id);
    teamIds.add(g.visitor_team_id);
  }
  for (const p of predictions) {
    if (p.player.team_id != null) teamIds.add(p.player.team_id);
  }
  for (const f of featuredPlayers) {
    if (f.team_id != null) teamIds.add(f.team_id);
  }
  const { data: teams } = teamIds.size
    ? await supabase
        .from("teams")
        .select("id, abbreviation, full_name")
        .in("id", [...teamIds])
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
  const patternHints = new Map<string, InsightHint[]>();
  const patternKeys = new Set<string>();
  if (playerIdsWithPicks.length > 0) {
    const { data: patternRows } = await supabase
      .from("patterns")
      .select("player_id, market, pattern_type, description")
      .in("player_id", playerIdsWithPicks);
    for (const row of (patternRows ?? []) as Array<{
      player_id: number;
      market: string | null;
      pattern_type: string;
      description: string;
    }>) {
      const key = `${row.player_id}:${row.market ?? ""}`;
      patternKeys.add(key);
      const list = patternHints.get(key) ?? [];
      list.push({ pattern_type: row.pattern_type, description: row.description });
      patternHints.set(key, list);
    }
  }
  const hasPatternFor = (p: PredictionRow) =>
    patternKeys.has(`${p.player_id}:${p.market}`);
  const hintsFor = (p: PredictionRow): InsightHint[] =>
    patternHints.get(`${p.player_id}:${p.market}`) ?? [];

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
  // Lowered floor from 75 → 60 so small slates still surface combos.
  // generateCombos already sorts results by combined confidence desc.
  // One combo set per tier — same input slate, different leg counts mapped
  // to the multiplier ladder in COMBO_TIERS (3× / 5× / 10× / 20× / 37.5×).
  const combosByTier = COMBO_TIERS.map((tier) => {
    const combos = generateCombos(predictions as unknown as Prediction[], {
      minConfidence: 60,
      size: tier.legs,
      max: tier.legs <= 3 ? 4 : 2,
      payouts,
    }).map((c) => ({
      ...c,
      picks: c.picks as unknown as PredictionRow[],
    }));
    return { tier, combos };
  });

  return (
    <div className="fade-up">
      <Hero stats={engineStats} />

      <TodaysSlate
        games={games}
        predictions={predictions}
        teamById={teamById}
        date={date}
      />

      {botd ? (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-2 pb-6">
          <BetOfTheDayCard
            prediction={botd}
            team={teamById.get(botd.player.team_id ?? -1) ?? null}
            played={playedSet.has(botd.id)}
            isSignedIn={isSignedIn}
            hints={hintsFor(botd)}
          />
        </section>
      ) : null}

      <ComboNav />
      {combosByTier.map(({ tier, combos }) => (
        <MoneyCombos
          key={tier.slug}
          tier={tier}
          combos={combos}
          teamById={teamById}
        />
      ))}

      <TrendingPlayers players={featuredPlayers} />

      <section
        id="picks"
        className="mx-auto max-w-7xl px-4 sm:px-6 py-12 space-y-6 scroll-mt-24"
      >
        <SectionHeading
          eyebrow="NBA · Today"
          title={
            <>
              Today&apos;s Top{" "}
              <span
                style={{
                  background:
                    "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Picks
              </span>
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
            <PicksFilterBar
              totalCount={allOthers.length}
              filteredCount={filteredOthers.length}
            />

            {filteredOthers.length === 0 ? (
              <div className="card-tmb p-6 text-sm text-muted-foreground text-center">
                No picks match your filters. Try widening the market or lowering
                the confidence threshold.
              </div>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOthers.slice(0, 6).map((p) => (
                <PickCard
                  key={p.id}
                  prediction={p}
                  team={teamById.get(p.player.team_id ?? -1) ?? null}
                  href={`/players/${p.player.id}`}
                  odds={"-110"}
                  gameTimeLabel={undefined}
                />
              ))}
            </div>
            {filteredOthers.length > 6 ? (
              <details className="card-tmb rounded-2xl overflow-hidden">
                <summary className="cursor-pointer select-none px-5 py-3.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground/85 list-none flex items-center justify-between">
                  <span>
                    Show the full slate
                    <span className="text-foreground/60 ml-2">
                      ({filteredOthers.length - 6} more)
                    </span>
                  </span>
                  <span aria-hidden className="text-primary">+</span>
                </summary>
                <div className="border-t border-border/60 p-4 grid gap-3">
                  {filteredOthers.slice(6).map((p) => (
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
          </>
        )}
      </section>

      <PillarRow />
      <WinnersClub stats={engineStats} />
    </div>
  );
}

function BetOfTheDayCard({
  prediction,
  team,
  played,
  isSignedIn,
  hints,
}: {
  prediction: PredictionRow;
  team: TeamLite | null;
  played: boolean;
  isSignedIn: boolean;
  hints: InsightHint[];
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
        <h2 className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 border border-primary/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            <span aria-hidden className="text-sm leading-none">★</span>
            Bet of the Day
          </span>
          {hints.length > 0 ? <InsightChip hints={hints} /> : null}
        </h2>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] items-start">
          <div className="space-y-5">
            <div className="flex items-start gap-5 flex-wrap">
              <PlayerAvatar
                playerId={prediction.player.id}
                firstName={prediction.player.first_name}
                lastName={prediction.player.last_name}
                abbreviation={team?.abbreviation ?? ""}
                size={120}
                variant="sticker"
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
                  <Link
                    href={`/players/${prediction.player.id}`}
                    className="block hover:underline underline-offset-4"
                  >
                    <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                      {name}
                    </h3>
                  </Link>
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

function ComboNav() {
  return (
    <nav
      aria-label="Jump to combo size"
      className="mx-auto max-w-7xl px-4 sm:px-6 pt-4"
    >
      <div className="card-tmb rounded-full inline-flex items-center gap-1 p-1 text-xs flex-wrap">
        <span className="px-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Jump to
        </span>
        {COMBO_TIERS.map((tier) => (
          <Link
            key={tier.slug}
            href={`#combo-${tier.slug}`}
            className="rounded-full px-3 py-1.5 hover:bg-foreground/10 font-mono tabular-nums"
          >
            <span className="text-foreground/85">
              {tier.legs}-bet
            </span>{" "}
            <span className="text-primary font-semibold">
              {tier.multiplier % 1 === 0
                ? `${tier.multiplier}×`
                : `${tier.multiplier.toFixed(1)}×`}
            </span>
          </Link>
        ))}
      </div>
    </nav>
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
