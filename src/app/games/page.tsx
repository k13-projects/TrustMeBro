import Image from "next/image";
import Link from "next/link";
import { nbaProvider } from "@/lib/sports/nba";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import { teamColors, teamLogoUrl } from "@/lib/sports/nba/branding";
import { DatePill } from "@/components/DatePill";
import type { Game, Team } from "@/lib/sports/types";

export const revalidate = 30;

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function GamesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = isValidIsoDate(params.date) ? params.date : todayIsoDate();
  const prev = isoDateOffset(date, -1);
  const next = isoDateOffset(date, 1);

  let games: Game[] = [];
  let hasError = false;
  try {
    const res = await nbaProvider().listGames({ dates: [date], per_page: 100 });
    games = res.data;
  } catch (e) {
    hasError = true;
    if (process.env.NODE_ENV !== "production") {
      console.error("[games/page] listGames failed", e);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            NBA · Scoreboard
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
            Games
          </h1>
          <p className="text-sm text-foreground/55 mt-1">
            Scores and status for {date}
          </p>
        </div>
        <nav className="glass rounded-full flex items-center gap-1 p-1 text-sm">
          <DatePill href={`/games?date=${prev}`} label={`← ${prev}`} />
          <DatePill href="/games" label="Today" emphasis />
          <DatePill href={`/games?date=${next}`} label={`${next} →`} />
        </nav>
      </div>

      {hasError ? (
        <ErrorCard date={date} />
      ) : games.length === 0 ? (
        <div className="glass glass-sheen rounded-2xl p-8 text-center text-foreground/60">
          No games on {date}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  const isFinal = game.status?.toLowerCase().includes("final");
  const homeWins = isFinal && game.home_team_score > game.visitor_team_score;
  const visitorWins = isFinal && game.visitor_team_score > game.home_team_score;
  const home = teamColors(game.home_team.abbreviation);
  const away = teamColors(game.visitor_team.abbreviation);

  const matchupLabel = `${game.visitor_team.full_name} at ${game.home_team.full_name} — open matchup`;

  return (
    <Link
      href={`/games/${game.id}`}
      aria-label={matchupLabel}
      className="group relative block overflow-hidden rounded-2xl glass glass-sheen grain transition hover:-translate-y-0.5 hover:ring-1 hover:ring-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
    >
      <article>
        <div
          aria-hidden
          className="absolute inset-0 opacity-50 pointer-events-none transition group-hover:opacity-70"
          style={{
            background: `linear-gradient(90deg, ${away.primary}44 0%, transparent 45%, transparent 55%, ${home.primary}44 100%)`,
          }}
        />
        <div className="relative p-5 space-y-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-foreground/55">
            <span>{game.status || "Scheduled"}</span>
            <span className="flex items-center gap-2">
              {game.postseason ? (
                <span className="rounded-full bg-amber-400/15 text-amber-300 px-2 py-0.5 border border-amber-400/30 text-[10px]">
                  Playoffs
                </span>
              ) : null}
              <span
                aria-hidden
                className="text-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-foreground/75"
              >
                →
              </span>
            </span>
          </div>
          <TeamRow
            team={game.visitor_team}
            score={game.visitor_team_score}
            winning={visitorWins}
            finalized={isFinal}
          />
          <div className="border-t border-white/8" />
          <TeamRow
            team={game.home_team}
            score={game.home_team_score}
            winning={homeWins}
            finalized={isFinal}
            home
          />
        </div>
      </article>
    </Link>
  );
}

function TeamRow({
  team,
  score,
  winning,
  finalized,
  home,
}: {
  team: Team;
  score: number;
  winning: boolean;
  finalized: boolean;
  home?: boolean;
}) {
  const logo = teamLogoUrl(team.abbreviation);
  const colors = teamColors(team.abbreviation);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="size-12 rounded-xl grid place-items-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${colors.primary}40, ${colors.secondary}25)`,
            boxShadow: `inset 0 0 0 1px ${colors.primary}55`,
          }}
        >
          {logo ? (
            <Image
              src={logo}
              alt={team.abbreviation}
              width={56}
              height={56}
              className="size-9 object-contain"
              unoptimized
            />
          ) : (
            <span className="text-xs font-semibold">{team.abbreviation}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-medium truncate ${
                finalized && !winning ? "text-foreground/55" : ""
              }`}
            >
              {team.full_name}
            </span>
            {home ? (
              <span className="text-[9px] uppercase tracking-widest text-foreground/40">
                Home
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-foreground/50 font-mono">
            {team.abbreviation}
          </div>
        </div>
      </div>
      <div
        className={`text-3xl font-semibold tabular-nums ${
          finalized && winning
            ? "text-foreground"
            : finalized
              ? "text-foreground/45"
              : "text-foreground/80"
        }`}
      >
        {score}
      </div>
    </div>
  );
}

function ErrorCard({ date }: { date: string }) {
  return (
    <div className="glass glass-sheen rounded-2xl p-6 border border-amber-400/30 space-y-3">
      <h2 className="font-semibold">Couldn&apos;t load games</h2>
      <p className="text-sm text-foreground/70">
        We had trouble reaching the scoreboard for {date}. This is usually a
        temporary issue with the upstream data provider — try again in a moment.
      </p>
      <DatePill href={`/games?date=${date}`} label="Retry" />
    </div>
  );
}
