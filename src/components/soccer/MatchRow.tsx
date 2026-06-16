import Image from "next/image";
import type { MatchRow as Match } from "@/lib/sports/soccer/queries";

function Crest({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <span className="inline-flex size-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-foreground/70">
        {alt.slice(0, 3).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={28}
      height={28}
      className="size-7 object-contain"
      unoptimized
    />
  );
}

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
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <Crest src={match.home.crest} alt={match.home.abbreviation || match.home.name} />
            <span className="truncate font-semibold">{match.home.name}</span>
          </span>
          {showScore ? (
            <span className="tabular-nums font-bold">{match.home_score}</span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <Crest src={match.away.crest} alt={match.away.abbreviation || match.away.name} />
            <span className="truncate font-semibold">{match.away.name}</span>
          </span>
          {showScore ? (
            <span className="tabular-nums font-bold">{match.away_score}</span>
          ) : null}
        </div>
      </div>

      <div className="w-20 shrink-0 text-right text-xs">
        {live ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
  );
}
