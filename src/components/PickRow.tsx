import { teamColors } from "@/lib/sports/nba/branding";
import { ConfidencePill } from "./ConfidencePill";
import { JerseyChip } from "./JerseyChip";
import { marketLabel } from "./MarketLabel";
import { PickSideTag } from "./PickSideTag";
import { PlayerAvatar } from "./PlayerAvatar";
import { ReasoningPanel } from "./ReasoningPanel";
import { TeamBadge } from "./TeamBadge";
import type { PredictionRow, TeamLite } from "./types";

export function PickRow({
  prediction,
  team,
}: {
  prediction: PredictionRow;
  team: TeamLite | null;
}) {
  const market = marketLabel(prediction.market);
  const colors = teamColors(team?.abbreviation);
  const name = `${prediction.player.first_name} ${prediction.player.last_name}`;

  return (
    <details className="group glass glass-sheen rounded-2xl overflow-hidden relative">
      <summary className="cursor-pointer list-none p-3 sm:p-4 flex items-center gap-4">
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
          style={{
            background: `linear-gradient(180deg, ${colors.primary}, ${colors.secondary})`,
          }}
        />
        <PlayerAvatar
          playerId={prediction.player.id}
          firstName={prediction.player.first_name}
          lastName={prediction.player.last_name}
          abbreviation={team?.abbreviation ?? ""}
          size={48}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{name}</span>
            <JerseyChip number={prediction.player.jersey_number} />
            <TeamBadge team={team} size={18} />
            {prediction.player.position ? (
              <span className="text-[10px] text-foreground/45 font-mono uppercase">
                {prediction.player.position}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-baseline gap-2 text-sm">
            <PickSideTag side={prediction.pick} />
            <span className="font-mono tabular-nums">{prediction.line}</span>
            <span className="text-foreground/60">{market}</span>
          </div>
        </div>
        <div className="hidden sm:block text-right">
          <div className="text-[10px] uppercase tracking-widest text-foreground/45">
            Projection
          </div>
          <div className="font-mono tabular-nums text-foreground/80">
            {prediction.projection.toFixed(1)}
          </div>
        </div>
        <ConfidencePill score={prediction.confidence} />
        <span
          aria-hidden
          className="text-foreground/40 transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <ReasoningPanel reasoning={prediction.reasoning} />
      </div>
    </details>
  );
}
