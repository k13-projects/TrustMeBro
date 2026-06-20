import type { MatchRow as Match } from "@/lib/sports/soccer/queries";
import { LiveMatch } from "./LiveMatch";
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

      {/* LiveMatch wraps the banner; it auto-updates the score while in-play
          and otherwise renders the same static banner. */}
      <LiveMatch match={match} />

      {live || done ? (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
          <MatchEvents matchId={match.id} home={match.home.name} away={match.away.name} />
        </div>
      ) : null}
    </div>
  );
}
