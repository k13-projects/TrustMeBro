import Link from "next/link";
import type { FollowedFixture } from "@/lib/sports/soccer/follow-queries";
import { LocalTime } from "@/components/site/LocalTime";
import { TeamCrest } from "./TeamCrest";

// What the viewer actually came for. Empty until they follow someone, and
// then it leads the page, because "my clubs" beats "every club in Europe".
export function MyClubsStrip({ fixtures }: { fixtures: FollowedFixture[] }) {
  if (fixtures.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 px-5 py-6 text-center">
        <p className="text-sm text-foreground/60">
          Follow a club and this is where their next match lands.
        </p>
        <Link
          href="/football/clubs"
          className="mt-2 inline-block text-sm font-semibold text-primary hover:text-primary-hover"
        >
          Browse clubs →
        </Link>
      </div>
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_0,#000_calc(100%-3rem),transparent)] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max items-stretch gap-3">
        {fixtures.map(({ team, match }) => {
          const opponent =
            match && (match.home.id === team.id ? match.away : match.home);
          const home = match ? match.home.id === team.id : false;
          return (
            <div
              key={team.id}
              className="w-56 shrink-0 rounded-2xl border border-border/60 bg-card/40 p-3"
            >
              <Link
                href={`/football/club/${team.id}`}
                className="flex items-center gap-2 py-1 -my-1 hover:text-primary"
              >
                <TeamCrest crest={team.crest} name={team.name} size={22} />
                <span className="min-w-0 truncate text-sm font-semibold">{team.name}</span>
              </Link>
              {match && opponent ? (
                <Link
                  href={`/football/match/${match.id}`}
                  className="mt-2 block rounded-xl bg-black/25 px-2.5 py-2 transition-colors hover:bg-black/40"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-foreground/40">
                      {home ? "vs" : "at"}
                    </span>
                    <TeamCrest crest={opponent.crest} name={opponent.name} size={16} />
                    <span className="min-w-0 truncate text-xs font-semibold">
                      {opponent.name}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-foreground/50">
                    {match.finished ? (
                      `Full time ${match.home_score}–${match.away_score}`
                    ) : (
                      <LocalTime
                        iso={match.datetime}
                        fallback={match.date}
                        format="dayTime"
                      />
                    )}
                  </div>
                </Link>
              ) : (
                <p className="mt-2 text-[11px] text-foreground/40">No fixture on record.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
