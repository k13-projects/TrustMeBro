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

  // Series score (postseason) or season record (regular). Both pull from
  // finalized games this season — the current game counts if it's final.
  const context = await loadGameContext(supabase, game);

  // Every finalized prior meeting between these two teams, newest first.
  const headToHead = await loadHeadToHead(supabase, game);

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

      <GameHero
        game={game}
        home={home}
        away={away}
        context={context}
      />

      {headToHead.length > 0 ? (
        <HeadToHeadCard
          home={home}
          away={away}
          meetings={headToHead}
        />
      ) : null}

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

type GameContext =
  | {
      kind: "playoff";
      home_wins: number;
      away_wins: number;
      games_played: number;
    }
  | {
      kind: "regular";
      home_record: { wins: number; losses: number };
      away_record: { wins: number; losses: number };
    }
  | null;

async function loadGameContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  game: GameRow,
): Promise<GameContext> {
  if (game.postseason) {
    const { data } = await supabase
      .from("games")
      .select(
        "id, status, home_team_id, visitor_team_id, home_team_score, visitor_team_score",
      )
      .eq("season", game.season)
      .eq("postseason", true)
      .or(
        `and(home_team_id.eq.${game.home_team_id},visitor_team_id.eq.${game.visitor_team_id}),and(home_team_id.eq.${game.visitor_team_id},visitor_team_id.eq.${game.home_team_id})`,
      );
    const seriesGames = (data ?? []) as Array<{
      id: number;
      status: string;
      home_team_id: number;
      visitor_team_id: number;
      home_team_score: number;
      visitor_team_score: number;
    }>;
    let homeWins = 0;
    let awayWins = 0;
    let played = 0;
    for (const g of seriesGames) {
      if (!g.status?.toLowerCase().includes("final")) continue;
      played++;
      const homeIsHomeInThisGame = g.home_team_id === game.home_team_id;
      const homeScore = homeIsHomeInThisGame
        ? g.home_team_score
        : g.visitor_team_score;
      const awayScore = homeIsHomeInThisGame
        ? g.visitor_team_score
        : g.home_team_score;
      if (homeScore > awayScore) homeWins++;
      else if (awayScore > homeScore) awayWins++;
    }
    return {
      kind: "playoff",
      home_wins: homeWins,
      away_wins: awayWins,
      games_played: played,
    };
  }

  async function recordFor(teamId: number) {
    const { data } = await supabase
      .from("games")
      .select(
        "status, home_team_id, visitor_team_id, home_team_score, visitor_team_score",
      )
      .eq("season", game.season)
      .eq("postseason", false)
      .or(`home_team_id.eq.${teamId},visitor_team_id.eq.${teamId}`);
    let wins = 0;
    let losses = 0;
    for (const g of (data ?? []) as Array<{
      status: string;
      home_team_id: number;
      visitor_team_id: number;
      home_team_score: number;
      visitor_team_score: number;
    }>) {
      if (!g.status?.toLowerCase().includes("final")) continue;
      const teamIsHome = g.home_team_id === teamId;
      const teamScore = teamIsHome ? g.home_team_score : g.visitor_team_score;
      const oppScore = teamIsHome ? g.visitor_team_score : g.home_team_score;
      if (teamScore > oppScore) wins++;
      else if (oppScore > teamScore) losses++;
    }
    return { wins, losses };
  }

  const [home_record, away_record] = await Promise.all([
    recordFor(game.home_team_id),
    recordFor(game.visitor_team_id),
  ]);
  return { kind: "regular", home_record, away_record };
}

function GameHero({
  game,
  home,
  away,
  context,
}: {
  game: GameRow;
  home: TeamLite | null;
  away: TeamLite | null;
  context: GameContext;
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
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-foreground/55 flex-wrap gap-2">
          <span>{game.status || "Scheduled"}</span>
          <div className="flex items-center gap-2">
            <ContextBadge
              context={context}
              homeAbbrev={home?.abbreviation ?? ""}
              awayAbbrev={away?.abbreviation ?? ""}
            />
            {game.postseason ? (
              <span className="rounded-full bg-amber-400/15 text-amber-300 px-2 py-0.5 border border-amber-400/30">
                Playoffs
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6">
          <TeamHero team={away} score={game.visitor_team_score} won={awayWins} finalized={isFinal} side="left" />
          <div className="text-center order-first sm:order-none flex sm:block items-center justify-center gap-2">
            <div className="text-[10px] uppercase tracking-widest text-foreground/45">
              {game.date}
            </div>
            <div className="hidden sm:block text-3xl font-semibold tabular-nums text-foreground/40 mt-1">
              @
            </div>
            <div
              aria-hidden
              className="sm:hidden inline-flex items-center justify-center size-6 rounded-full bg-white/8 text-foreground/55 text-xs"
            >
              @
            </div>
          </div>
          <TeamHero team={home} score={game.home_team_score} won={homeWins} finalized={isFinal} side="right" home />
        </div>
      </div>
    </section>
  );
}

function ContextBadge({
  context,
  homeAbbrev,
  awayAbbrev,
}: {
  context: GameContext;
  homeAbbrev: string;
  awayAbbrev: string;
}) {
  if (!context) return null;
  if (context.kind === "playoff") {
    if (context.games_played === 0) {
      return (
        <span className="rounded-full bg-white/5 border border-white/10 text-foreground/65 px-2 py-0.5 normal-case">
          Series tied 0-0
        </span>
      );
    }
    const { home_wins, away_wins } = context;
    let label: string;
    if (home_wins === away_wins) {
      label = `Series tied ${home_wins}-${away_wins}`;
    } else if (home_wins > away_wins) {
      label = `${homeAbbrev} leads ${home_wins}-${away_wins}`;
    } else {
      label = `${awayAbbrev} leads ${away_wins}-${home_wins}`;
    }
    return (
      <span className="rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 px-2 py-0.5 normal-case font-mono tabular-nums">
        {label}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/5 border border-white/10 text-foreground/75 px-2 py-0.5 normal-case font-mono tabular-nums">
      <span title={`${awayAbbrev} season record`}>
        {awayAbbrev} {context.away_record.wins}-{context.away_record.losses}
      </span>
      <span className="text-foreground/35 mx-1.5">·</span>
      <span title={`${homeAbbrev} season record`}>
        {homeAbbrev} {context.home_record.wins}-{context.home_record.losses}
      </span>
    </span>
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
      className={`flex items-center gap-4 ${side === "right" ? "sm:flex-row-reverse sm:text-right" : ""}`}
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

// ---------------------------------------------------------------------------
// Head-to-head (previous meetings between these two teams)
// ---------------------------------------------------------------------------

type H2HMeeting = {
  id: number;
  date: string;
  status: string;
  postseason: boolean;
  home_team_id: number;
  visitor_team_id: number;
  home_team_score: number;
  visitor_team_score: number;
};

async function loadHeadToHead(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  game: GameRow,
): Promise<H2HMeeting[]> {
  const a = game.home_team_id;
  const b = game.visitor_team_id;
  const { data } = await supabase
    .from("games")
    .select(
      "id, date, status, postseason, home_team_id, visitor_team_id, home_team_score, visitor_team_score",
    )
    .or(
      `and(home_team_id.eq.${a},visitor_team_id.eq.${b}),and(home_team_id.eq.${b},visitor_team_id.eq.${a})`,
    )
    .neq("id", game.id)
    .order("date", { ascending: false })
    .limit(12);
  const rows = (data ?? []) as H2HMeeting[];
  // Only finalized meetings count — pre-game / postponed / live without a
  // final score would just be noise here.
  return rows.filter((g) => g.status?.toLowerCase().includes("final"));
}

function HeadToHeadCard({
  home,
  away,
  meetings,
}: {
  home: TeamLite | null;
  away: TeamLite | null;
  meetings: H2HMeeting[];
}) {
  // Tally W-L from each team's perspective across the meetings shown.
  let homeWins = 0;
  let awayWins = 0;
  for (const m of meetings) {
    const homeIsHome = m.home_team_id === home?.id;
    const homeScore = homeIsHome ? m.home_team_score : m.visitor_team_score;
    const awayScore = homeIsHome ? m.visitor_team_score : m.home_team_score;
    if (homeScore > awayScore) homeWins++;
    else if (awayScore > homeScore) awayWins++;
  }

  return (
    <section className="glass glass-sheen rounded-2xl overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/8 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-foreground/45">
            Head-to-head
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/35">
            · last {meetings.length} meeting{meetings.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-foreground/70">
          <span className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5">
            {away?.abbreviation ?? "AWAY"}{" "}
            <span className="text-foreground/85 font-semibold">{awayWins}</span>
          </span>
          <span className="text-foreground/30">·</span>
          <span className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5">
            {home?.abbreviation ?? "HOME"}{" "}
            <span className="text-foreground/85 font-semibold">{homeWins}</span>
          </span>
        </div>
      </header>
      <ul className="divide-y divide-white/5">
        {meetings.map((m) => (
          <H2HRow
            key={m.id}
            meeting={m}
            home={home}
            away={away}
          />
        ))}
      </ul>
    </section>
  );
}

function H2HRow({
  meeting,
  home,
  away,
}: {
  meeting: H2HMeeting;
  home: TeamLite | null;
  away: TeamLite | null;
}) {
  // Reorient scores so the row always reads "away team · home team", matching
  // how the current game's hero is laid out (consistent reading order).
  const wasHomeForUs = meeting.home_team_id === home?.id;
  const homeScore = wasHomeForUs
    ? meeting.home_team_score
    : meeting.visitor_team_score;
  const awayScore = wasHomeForUs
    ? meeting.visitor_team_score
    : meeting.home_team_score;
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;
  const dateLabel = new Date(meeting.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <li>
      <Link
        href={`/games/${meeting.id}`}
        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-2.5 text-sm hover:bg-white/[0.04] focus-visible:outline-none focus-visible:bg-white/[0.06]"
      >
        <span className="text-[11px] tabular-nums text-foreground/55 font-mono w-[5.5rem]">
          {dateLabel}
        </span>
        <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
          <span
            className={`flex items-center justify-end gap-2 ${awayWon ? "text-foreground font-semibold" : "text-foreground/55"}`}
          >
            <span className="uppercase tracking-wide">
              {away?.abbreviation ?? "AWAY"}
            </span>
            <span className="font-mono tabular-nums">{awayScore}</span>
          </span>
          <span className="text-foreground/30 text-xs font-mono">−</span>
          <span
            className={`flex items-center justify-start gap-2 ${homeWon ? "text-foreground font-semibold" : "text-foreground/55"}`}
          >
            <span className="font-mono tabular-nums">{homeScore}</span>
            <span className="uppercase tracking-wide">
              {home?.abbreviation ?? "HOME"}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-foreground/40">
          {meeting.postseason ? (
            <span className="rounded bg-amber-400/15 text-amber-300/85 border border-amber-400/30 px-1.5 py-0.5">
              Playoffs
            </span>
          ) : null}
          <span aria-hidden>›</span>
        </span>
      </Link>
    </li>
  );
}
