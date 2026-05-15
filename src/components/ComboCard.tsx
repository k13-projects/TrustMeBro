import { teamColors } from "@/lib/sports/nba/branding";
import { ConfidencePill } from "./ConfidencePill";
import { JerseyChip } from "./JerseyChip";
import { marketLabel } from "./MarketLabel";
import { PickSideTag } from "./PickSideTag";
import { PlayerAvatar } from "./PlayerAvatar";
import type { PredictionRow, TeamLite } from "./types";

type ComboCardData = {
  picks: PredictionRow[];
  combined_confidence: number;
  power_payout: number;
  flex_payout: number;
};

export function ComboCard({
  combo,
  teamById,
}: {
  combo: ComboCardData;
  teamById: Map<number, TeamLite>;
}) {
  return (
    <article className="glass glass-sheen rounded-2xl p-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-foreground/55">
          {combo.picks.length}-pick combo
        </span>
        <ConfidencePill score={combo.combined_confidence} />
      </header>
      <div className="space-y-2">
        {combo.picks.map((p, i) => (
          <ComboPickRow
            key={p.id}
            prediction={p}
            team={teamById.get(p.player.team_id ?? -1) ?? null}
            divider={i > 0}
          />
        ))}
      </div>
      <footer className="flex items-center justify-between text-[10px] uppercase tracking-widest text-foreground/55 pt-2 border-t border-white/8">
        <span>PrizePicks</span>
        <span className="flex items-center gap-3 font-mono tabular-nums">
          <span title="Power: all picks must hit">
            Power <span className="text-amber-300">{combo.power_payout}×</span>
          </span>
          {combo.flex_payout > 0 ? (
            <span title="Flex: most picks must hit">
              Flex <span className="text-foreground/65">{combo.flex_payout}×</span>
            </span>
          ) : null}
        </span>
      </footer>
    </article>
  );
}

function ComboPickRow({
  prediction,
  team,
  divider,
}: {
  prediction: PredictionRow;
  team: TeamLite | null;
  divider: boolean;
}) {
  const colors = teamColors(team?.abbreviation);
  return (
    <div
      className={`flex items-center gap-3 ${divider ? "pt-2 border-t border-white/5" : ""}`}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: colors.primary }}
      />
      <PlayerAvatar
        playerId={prediction.player.id}
        firstName={prediction.player.first_name}
        lastName={prediction.player.last_name}
        abbreviation={team?.abbreviation ?? ""}
        size={32}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">
            {prediction.player.first_name} {prediction.player.last_name}
          </span>
          <JerseyChip number={prediction.player.jersey_number} />
        </div>
        <div className="text-xs mt-0.5 flex items-baseline gap-1.5">
          <PickSideTag side={prediction.pick} />
          <span className="font-mono tabular-nums">{prediction.line}</span>
          <span className="text-foreground/55">
            {marketLabel(prediction.market)}
          </span>
        </div>
      </div>
    </div>
  );
}
