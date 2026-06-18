import type { MatchRow as Match } from "@/lib/sports/soccer/queries";
import { MatchBanner } from "./MatchBanner";
import { MatchEvents } from "./MatchEvents";

export function MatchRow({ match }: { match: Match }) {
  const live = match.state === "in";
  const done = match.state === "post";

  return (
    <div className="space-y-1.5">
      {match.group ? (
        <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
          {match.group}
        </div>
      ) : null}

      <MatchBanner
        home={match.home}
        away={match.away}
        score={live || done ? { home: match.home_score, away: match.away_score } : null}
        state={match.state}
        clock={match.clock}
        datetime={match.datetime}
      />

      {live || done ? (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
          <MatchEvents matchId={match.id} home={match.home.name} away={match.away.name} />
        </div>
      ) : null}
    </div>
  );
}
