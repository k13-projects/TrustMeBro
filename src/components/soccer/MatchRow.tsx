import type { MatchRow as Match } from "@/lib/sports/soccer/queries";
import { CountryFlag } from "./CountryFlag";
import { MatchEvents } from "./MatchEvents";

function kickoff(datetime: string | null): string {
  if (!datetime) return "TBD";
  const d = new Date(datetime);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

export function MatchRow({ match }: { match: Match }) {
  const live = match.state === "in";
  const done = match.state === "post";
  const showScore = live || done;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40">
      <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <CountryFlag crest={match.home.crest} abbr={match.home.abbreviation} name={match.home.name} size={28} />
            <span className="truncate font-semibold">{match.home.name}</span>
          </span>
          {showScore ? (
            <span className="tabular-nums font-bold">{match.home_score}</span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <CountryFlag crest={match.away.crest} abbr={match.away.abbreviation} name={match.away.name} size={28} />
            <span className="truncate font-semibold">{match.away.name}</span>
          </span>
          {showScore ? (
            <span className="tabular-nums font-bold">{match.away_score}</span>
          ) : null}
        </div>
      </div>

      <div className="w-20 shrink-0 text-right text-xs">
        {live ? (
          <span className="inline-flex items-center gap-1 font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            {match.clock ?? "LIVE"}
          </span>
        ) : done ? (
          <span className="font-semibold text-foreground/55">FT</span>
        ) : (
          <span className="font-semibold text-foreground/70">{kickoff(match.datetime)}</span>
        )}
        {match.group ? (
          <div className="mt-1 text-[10px] uppercase tracking-wide text-foreground/40">
            {match.group}
          </div>
        ) : null}
      </div>
      </div>
      {live || done ? (
        <MatchEvents
          matchId={match.id}
          home={match.home.name}
          away={match.away.name}
        />
      ) : null}
    </div>
  );
}
