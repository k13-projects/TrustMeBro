import Image from "next/image";
import {
  COMPETITIONS,
  type SoccerCompetition,
} from "@/lib/sports/soccer/competitions";
import type { CompetitionLiveSignal } from "@/lib/sports/soccer/live-signals";
import { CompetitionSwitcher } from "./CompetitionSwitcher";

// The strip at the top of every /football page: which competition you're in,
// what phase it's at, and the switch to the other one. `phase` is the live
// round label ("Matchday 1 · 12 of 18 played") computed by the layout.
// `liveSignals` (plain object — Server → Client Component props stay
// serializable) drives the switcher's per-tab live/today dots.
export function CompetitionBar({
  competition,
  phase,
  liveSignals,
}: {
  competition: SoccerCompetition;
  phase: string | null;
  liveSignals: Partial<Record<SoccerCompetition, CompetitionLiveSignal>>;
}) {
  const meta = COMPETITIONS[competition];
  const archived = meta.status === "archived";
  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full border border-border/70 bg-black/50 shadow-[0_0_24px_-6px_rgba(79,166,255,0.45)]">
          <Image
            src={meta.logo}
            alt={`${meta.fullName} logo`}
            width={30}
            height={30}
            className="size-[30px] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
            unoptimized
          />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate font-display text-base uppercase tracking-[0.06em] sm:text-lg">
            {meta.fullName}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span>{meta.seasonLabel}</span>
            {phase ? (
              <>
                <span aria-hidden className="text-foreground/25">·</span>
                <span className={archived ? "" : "text-primary"}>{phase}</span>
              </>
            ) : null}
            {archived ? (
              <>
                <span aria-hidden className="text-foreground/25">·</span>
                <span className="rounded-full border border-border/70 px-1.5 py-px text-[9px] tracking-[0.16em] text-foreground/60">
                  Archived record
                </span>
              </>
            ) : (
              <>
                <span aria-hidden className="text-foreground/25">·</span>
                <span className="inline-flex items-center gap-1 text-primary">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  Live
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <CompetitionSwitcher active={competition} liveSignals={liveSignals} />
    </div>
  );
}
