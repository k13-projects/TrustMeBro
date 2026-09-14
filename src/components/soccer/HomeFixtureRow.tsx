import Image from "next/image";
import Link from "next/link";
import { LocalTime } from "@/components/site/LocalTime";
import type { MatchRow } from "@/lib/sports/soccer/queries";

// A compact fixture line for lists that are about "what is coming" rather
// than "what is happening": crest, name, crest, and the kickoff or result.
// Lighter than the full versus banner, which earns its space only on the
// matchday itself.
export function HomeFixtureRow({
  match,
  showResult = false,
}: {
  match: MatchRow;
  showResult?: boolean;
}) {
  const kickoff = match.datetime
    ? new Date(match.datetime).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      })
    : "TBD";

  const homeWon = match.home_score > match.away_score;
  const awayWon = match.away_score > match.home_score;

  return (
    <Link
      href={`/football/match/${match.id}`}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/5"
    >
      <Side crest={match.home.crest} name={match.home.name} dim={showResult && awayWon} />
      <span className="shrink-0 text-center text-xs font-bold tabular-nums text-foreground/70">
        {showResult && match.finished ? (
          <span className="text-sm text-foreground">
            {match.home_score}–{match.away_score}
          </span>
        ) : (
          <span className="text-foreground/45">v</span>
        )}
      </span>
      <Side
        crest={match.away.crest}
        name={match.away.name}
        dim={showResult && homeWon}
        reverse
      />
      <span className="hidden w-32 shrink-0 text-right text-[11px] text-foreground/45 sm:block">
        {showResult && match.finished ? (
          "Full time"
        ) : (
          <LocalTime iso={match.datetime} fallback={kickoff} format="dayTime" />
        )}
      </span>
    </Link>
  );
}

function Side({
  crest,
  name,
  dim,
  reverse = false,
}: {
  crest: string | null;
  name: string;
  dim?: boolean;
  reverse?: boolean;
}) {
  return (
    <span
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        reverse ? "flex-row-reverse text-right" : ""
      } ${dim ? "opacity-55" : ""}`}
    >
      {crest ? (
        <Image
          src={crest}
          alt=""
          width={22}
          height={22}
          className="size-[22px] shrink-0 object-contain"
          unoptimized
        />
      ) : (
        <span className="size-[22px] shrink-0 rounded-full bg-white/10" />
      )}
      <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
    </span>
  );
}
