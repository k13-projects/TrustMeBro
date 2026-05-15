import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { teamColors, teamLogoUrl } from "@/lib/sports/nba/branding";
import { PickRow } from "@/components/PickRow";
import { PlayButton } from "@/components/PlayButton";
import type { PredictionRow, TeamLite } from "@/components/types";

export const revalidate = 30;

type PageProps = {
  params: Promise<{ id: string }>;
};

type GameRow = {
  id: number;
  date: string;
  datetime: string | null;
  season: number;
  status: string;
  period: number;
  time: string | null;
  postseason: boolean;
  home_team_id: number;
  visitor_team_id: number;
  home_team_score: number;
  visitor_team_score: number;
};

export default async function GameDetailPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const gameId = Number(rawId);
  if (!Number.isFinite(gameId)) notFound();

  const supabase = await createSupabaseServerClient();

  const { data: game } = (await supabase
    .from("games")
    .select(
      "id, date, datetime, season, status, period, time, postseason, home_team_id, visitor_team_id, home_team_score, visitor_team_score",
    )
    .eq("id", gameId)
    .maybeSingle()) as { data: GameRow | null };

  if (!game) notFound();

  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, abbreviation, full_name")
    .in("id", [game.home_team_id, game.visitor_team_id]);
  const teams = (teamRows ?? []) as TeamLite[];
  const home = teams.find((t) => t.id === game.home_team_id) ?? null;
  const away = teams.find((t) => t.id === game.visitor_team_id) ?? null;

  const { data: predictionsRaw } = await supabase
    .from("predictions")
    .select(
      "id, game_id, player_id, market, line, pick, projection, confidence, is_bet_of_the_day, reasoning, player:players!inner(id, first_name, last_name, team_id, position, jersey_number)",
    )
    .eq("game_id", gameId)
    .order("is_bet_of_the_day", { ascending: false })
    .order("confidence", { ascending: false });
  const predictions = (predictionsRaw ?? []) as unknown as PredictionRow[];

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

  const homePicks = predictions.filter(
    (p) => p.player.team_id === game.home_team_id,
  );
  const awayPicks = predictions.filter(
    (p) => p.player.team_id === game.visitor_team_id,
  );
  const botd = predictions.find((p) => p.is_bet_of_the_day) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <Link
        href={`/games?date=${game.date}`}
        className="inline-flex items-center gap-2 text-xs text-foreground/55 hover:text-foreground"
      >
        ← {game.date} scoreboard
      </Link>

      <GameHero game={game} home={home} away={away} />

      {botd ? (
        <BotDStrip
          prediction={botd}
          team={
            botd.player.team_id === home?.id
              ? home
              : botd.player.team_id === away?.id
                ? away
                : null
          }
          played={playedSet.has(botd.id)}
          isSignedIn={isSignedIn}
        />
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <TeamPicksColumn
          team={away}
          picks={awayPicks}
          playedSet={playedSet}
          isSignedIn={isSignedIn}
          side="away"
        />
        <TeamPicksColumn
          team={home}
          picks={homePicks}
          playedSet={playedSet}
          isSignedIn={isSignedIn}
          side="home"
        />
      </section>

      {predictions.length === 0 ? (
        <div className="glass glass-sheen rounded-2xl p-8 text-center text-foreground/55">
          No picks generated for this game yet.
        </div>
      ) : null}
    </div>
  );
}

function GameHero({
  game,
  home,
  away,
}: {
  game: GameRow;
  home: TeamLite | null;
  away: TeamLite | null;
}) {
  const isFinal = game.status?.toLowerCase().includes("final");
  const homeWins =
    isFinal && game.home_team_score > game.visitor_team_score;
  const awayWins =
    isFinal && game.visitor_team_score > game.home_team_score;
  const homeColors = teamColors(home?.abbreviation);
  const awayColors = teamColors(away?.abbreviation);

  return (
    <section className="relative overflow-hidden rounded-3xl glass-strong glass-sheen grain">
      <div
        aria-hidden
        className="absolute inset-0 opacity-55 pointer-events-none"
        style={{
          background: `linear-gradient(90deg, ${awayColors.primary}55 0%, transparent 40%, transparent 60%, ${homeColors.primary}55 100%)`,
        }}
      />
      <div className="relative p-6 sm:p-10 space-y-6">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-foreground/55">
          <span>{game.status || "Scheduled"}</span>
          {game.postseason ? (
            <span className="rounded-full bg-amber-400/15 text-amber-300 px-2 py-0.5 border border-amber-400/30">
              Playoffs
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <TeamHero team={away} score={game.visitor_team_score} won={awayWins} finalized={isFinal} side="left" />
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-foreground/45">
              {game.date}
            </div>
            <div className="text-3xl font-semibold tabular-nums text-foreground/40 mt-1">
              @
            </div>
          </div>
          <TeamHero team={home} score={game.home_team_score} won={homeWins} finalized={isFinal} side="right" home />
        </div>
      </div>
    </section>
  );
}

function TeamHero({
  team,
  score,
  won,
  finalized,
  side,
  home,
}: {
  team: TeamLite | null;
  score: number;
  won: boolean;
  finalized: boolean;
  side: "left" | "right";
  home?: boolean;
}) {
  const colors = teamColors(team?.abbreviation);
  const logo = teamLogoUrl(team?.abbreviation);
  return (
    <Link
      href={team ? `/teams/${team.id}` : "#"}
      className={`flex items-center gap-4 ${side === "right" ? "flex-row-reverse text-right" : ""}`}
    >
      <div
        className="size-16 sm:size-20 rounded-2xl grid place-items-center shrink-0"
        style={{
          background: `linear-gradient(135deg, ${colors.primary}55, ${colors.secondary}30)`,
          boxShadow: `inset 0 0 0 1px ${colors.primary}55`,
        }}
      >
        {logo ? (
          <Image
            src={logo}
            alt={team?.abbreviation ?? ""}
            width={80}
            height={80}
            className="size-12 sm:size-14 object-contain"
            unoptimized
          />
        ) : (
          <span className="font-semibold">{team?.abbreviation ?? "?"}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-foreground/45">
          {home ? "Home" : "Away"}
        </div>
        <div className={`text-lg sm:text-xl font-semibold tracking-tight ${finalized && !won ? "text-foreground/55" : ""}`}>
          {team?.full_name ?? "?"}
        </div>
        <div
          className={`text-4xl sm:text-5xl font-semibold tabular-nums mt-1 ${
            finalized && won
              ? ""
              : finalized
                ? "text-foreground/45"
                : "text-foreground/80"
          }`}
        >
          {score}
        </div>
      </div>
    </Link>
  );
}

function BotDStrip({
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
  return (
    <section className="glass-strong glass-sheen rounded-2xl p-4 sm:p-5 flex items-center gap-4 flex-wrap">
      <span className="text-amber-300 text-base shrink-0" aria-hidden>★</span>
      <span className="text-[10px] uppercase tracking-[0.22em] text-amber-300/80 shrink-0">
        Bet of the Day
      </span>
      <div className="flex-1 min-w-[200px]">
        <PickRow
          prediction={prediction}
          team={team}
          trailing={
            <PlayButton
              predictionId={prediction.id}
              initialPlayed={played}
              isSignedIn={isSignedIn}
            />
          }
        />
      </div>
    </section>
  );
}

function TeamPicksColumn({
  team,
  picks,
  playedSet,
  isSignedIn,
  side,
}: {
  team: TeamLite | null;
  picks: PredictionRow[];
  playedSet: Set<string>;
  isSignedIn: boolean;
  side: "home" | "away";
}) {
  const colors = teamColors(team?.abbreviation);
  if (!team) return null;
  return (
    <section className="space-y-3">
      <header className="flex items-center gap-3">
        <span
          className="size-2 rounded-full"
          style={{ background: colors.primary }}
          aria-hidden
        />
        <Link href={`/teams/${team.id}`} className="font-semibold hover:underline">
          {team.full_name}
        </Link>
        <span className="text-[10px] uppercase tracking-widest text-foreground/45">
          {side} · {picks.length} picks
        </span>
      </header>
      {picks.length === 0 ? (
        <p className="text-xs text-foreground/45 italic">No picks for this side.</p>
      ) : (
        <div className="grid gap-2">
          {picks.map((p) => (
            <PickRow
              key={p.id}
              prediction={p}
              team={team}
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
      )}
    </section>
  );
}
