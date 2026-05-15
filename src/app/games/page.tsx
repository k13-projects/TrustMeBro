import Link from "next/link";
import { nbaProvider } from "@/lib/sports/nba";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import type { Game } from "@/lib/sports/types";

export const revalidate = 30;

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = isValidIsoDate(params.date) ? params.date : todayIsoDate();
  const prev = isoDateOffset(date, -1);
  const next = isoDateOffset(date, 1);

  let games: Game[] = [];
  let error: string | null = null;
  try {
    const res = await nbaProvider().listGames({ dates: [date], per_page: 100 });
    games = res.data;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">NBA games</h1>
          <p className="text-sm text-foreground/60 mt-1">
            Scores and status for {date}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/games?date=${prev}`}
            className="rounded border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            ← {prev}
          </Link>
          <Link
            href="/games"
            className="rounded border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            Today
          </Link>
          <Link
            href={`/games?date=${next}`}
            className="rounded border border-black/10 dark:border-white/15 px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            {next} →
          </Link>
        </div>
      </div>

      {error ? (
        <ErrorCard message={error} />
      ) : games.length === 0 ? (
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-8 text-center text-foreground/60">
          No games on {date}.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {games.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  const homeWins = game.home_team_score > game.visitor_team_score;
  const visitorWins = game.visitor_team_score > game.home_team_score;
  const isFinal = game.status?.toLowerCase().includes("final");

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-4 bg-background hover:border-black/20 dark:hover:border-white/20 transition-colors">
      <div className="flex items-center justify-between text-xs text-foreground/60 mb-3">
        <span>{game.status}</span>
        {game.postseason ? (
          <span className="rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5">
            Playoffs
          </span>
        ) : null}
      </div>
      <TeamRow
        name={game.visitor_team.full_name}
        score={game.visitor_team_score}
        winning={visitorWins}
        finalized={isFinal}
      />
      <TeamRow
        name={game.home_team.full_name}
        score={game.home_team_score}
        winning={homeWins}
        finalized={isFinal}
      />
    </div>
  );
}

function TeamRow({
  name,
  score,
  winning,
  finalized,
}: {
  name: string;
  score: number;
  winning: boolean;
  finalized: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className={
          finalized && !winning ? "text-foreground/50" : "text-foreground"
        }
      >
        {name}
      </span>
      <span
        className={`font-mono tabular-nums ${
          finalized && winning ? "font-semibold" : ""
        }`}
      >
        {score}
      </span>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  const isAuth = message.includes("BALLDONTLIE_API_KEY");
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 space-y-3">
      <h2 className="font-semibold">
        {isAuth ? "Setup required" : "Couldn't load games"}
      </h2>
      {isAuth ? (
        <>
          <p className="text-sm text-foreground/80">
            Add a balldontlie API key to <code>.env.local</code> to fetch live data.
          </p>
          <pre className="text-xs bg-black/5 dark:bg-white/5 p-3 rounded overflow-x-auto">
{`# .env.local
BALLDONTLIE_API_KEY=your_key_here`}
          </pre>
          <p className="text-sm">
            Get a key at{" "}
            <a
              href="https://www.balldontlie.io"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              balldontlie.io
            </a>
            , then restart the dev server.
          </p>
        </>
      ) : (
        <p className="text-sm text-foreground/80 break-words">{message}</p>
      )}
    </div>
  );
}
