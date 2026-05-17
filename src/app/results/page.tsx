import Link from "next/link";
import { nbaProvider } from "@/lib/sports/nba";
import { isoDateOffset, isValidIsoDate, todayIsoDate } from "@/lib/date";
import { DatePill } from "@/components/DatePill";
import { GameCard, isFinalStatus } from "@/components/games/GameCard";
import type { Game } from "@/lib/sports/types";

export const revalidate = 30;

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function ResultsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const today = todayIsoDate();
  const date = isValidIsoDate(params.date) ? params.date : isoDateOffset(today, -1);
  const prev = isoDateOffset(date, -1);
  const next = isoDateOffset(date, 1);

  let allGames: Game[] = [];
  let hasError = false;
  try {
    const res = await nbaProvider().listGames({ dates: [date], per_page: 100 });
    allGames = res.data;
  } catch (e) {
    hasError = true;
    if (process.env.NODE_ENV !== "production") {
      console.error("[results/page] listGames failed", e);
    }
  }

  const finals = allGames.filter((g) => isFinalStatus(g.status));
  const unfinishedCount = allGames.length - finals.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            NBA · Final Scores
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
            Results
          </h1>
          <p className="text-sm text-foreground/55 mt-1">
            Finished games for {date}
            {unfinishedCount > 0 ? (
              <>
                {" · "}
                <Link
                  href={`/games?date=${date}`}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {unfinishedCount} still upcoming or live →
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <nav className="glass rounded-full flex items-center gap-1 p-1 text-sm">
          <DatePill href={`/results?date=${prev}`} label={`← ${prev}`} />
          <DatePill
            href={`/results?date=${isoDateOffset(today, -1)}`}
            label="Yesterday"
            emphasis
          />
          <DatePill href={`/results?date=${next}`} label={`${next} →`} />
        </nav>
      </div>

      {hasError ? (
        <ErrorCard date={date} />
      ) : finals.length === 0 ? (
        <EmptyResults
          date={date}
          unfinishedCount={unfinishedCount}
          isToday={date === today}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {finals.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyResults({
  date,
  unfinishedCount,
  isToday,
}: {
  date: string;
  unfinishedCount: number;
  isToday: boolean;
}) {
  if (unfinishedCount > 0) {
    return (
      <div className="glass glass-sheen rounded-2xl p-8 text-center space-y-2">
        <p className="text-foreground/60">
          No games finished yet on {date}.
        </p>
        <Link
          href={`/games?date=${date}`}
          className="inline-block text-sm text-amber-300 underline underline-offset-2 hover:text-amber-200"
        >
          {unfinishedCount} {unfinishedCount === 1 ? "game is" : "games are"}{" "}
          still upcoming or live →
        </Link>
      </div>
    );
  }
  return (
    <div className="glass glass-sheen rounded-2xl p-8 text-center text-foreground/60">
      No games on {date}.
      {isToday ? (
        <span className="block mt-2 text-xs text-foreground/45">
          Try yesterday for the latest finals.
        </span>
      ) : null}
    </div>
  );
}

function ErrorCard({ date }: { date: string }) {
  return (
    <div className="glass glass-sheen rounded-2xl p-6 border border-amber-400/30 space-y-3">
      <h2 className="font-semibold">Couldn&apos;t load results</h2>
      <p className="text-sm text-foreground/70">
        We had trouble reaching the scoreboard for {date}. This is usually a
        temporary issue with the upstream data provider — try again in a moment.
      </p>
      <DatePill href={`/results?date=${date}`} label="Retry" />
    </div>
  );
}
