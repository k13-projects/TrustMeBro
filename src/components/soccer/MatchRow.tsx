import Link from "next/link";
import type { MatchRow as Match } from "@/lib/sports/soccer/queries";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { LiveMatch } from "./LiveMatch";
import { MatchEvents } from "./MatchEvents";

// One fixture: the versus banner (live-updating), an optional caption above
// (group / round / leg), and the expandable goals-and-cards timeline once the
// match has kicked off.
export function MatchRow({
  match,
  caption,
}: {
  match: Match;
  /** Text above the banner: "Group A", "Play-off Round · 2nd Leg", venue… */
  caption?: string | null;
}) {
  const live = match.state === "in";
  const done = match.state === "post";
  // Default caption: leg/group plus venue ("Play-off Round · 2nd Leg" comes
  // from the page; here it's "1st Leg · Signal Iduna Park"). Kept above the
  // banner so the medallion stays score + status only.
  const heading =
    caption === undefined
      ? [match.group, match.venue].filter(Boolean).join(" · ") || null
      : caption;

  return (
    <div className="space-y-1.5">
      {heading ? (
        <div className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
          {heading}
        </div>
      ) : null}

      <Link href={`/football/match/${match.id}`} className="block transition-opacity hover:opacity-90">
        <LiveMatch match={match} />
      </Link>

      {live || done ? (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
          <MatchEvents
            matchId={match.id}
            home={match.home.name}
            away={match.away.name}
            competitionName={COMPETITIONS[match.competition].label}
          />
        </div>
      ) : null}
    </div>
  );
}
