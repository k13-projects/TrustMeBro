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
    <article className="group glass glass-sheen rounded-2xl p-4 space-y-3 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-30px_rgba(16,185,129,0.5)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
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
      <footer className="pt-2 border-t border-white/8 space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-foreground/55">
          <span>PrizePicks payout</span>
          <span className="flex items-center gap-3 font-mono tabular-nums">
            <span className="flex items-center gap-1">
              <span>Power</span>
              <span className="text-amber-300">{combo.power_payout}×</span>
            </span>
            {combo.flex_payout > 0 ? (
              <span className="flex items-center gap-1">
                <span>Flex</span>
                <span className="text-foreground/65">
                  {combo.flex_payout}×
                </span>
              </span>
            ) : null}
          </span>
        </div>
        <p className="text-[10px] text-foreground/50 leading-relaxed">
          <span className="text-amber-300">Power</span> requires every pick to
          hit.
          {combo.flex_payout > 0 ? (
            <>
              {" "}
              <span className="text-foreground/75">Flex</span> pays a smaller
              multiple if most picks hit.
            </>
          ) : null}
        </p>
        <a
          href="https://app.prizepicks.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/8 hover:bg-white/12 border border-white/10 px-3 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508]"
        >
          Open on PrizePicks
          <span aria-hidden>↗</span>
        </a>
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
