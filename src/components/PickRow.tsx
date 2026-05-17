import type { ReactNode } from "react";
import { teamColors } from "@/lib/sports/nba/branding";
import { AddToCouponButton } from "./cart/AddToCouponButton";
import { ConfidencePill } from "./ConfidencePill";
import { JerseyChip } from "./JerseyChip";
import { marketLabel } from "./MarketLabel";
import { PickSideTag } from "./PickSideTag";
import { PlayerAvatar } from "./PlayerAvatar";
import { ReasoningPanel, topReasoningCheck } from "./ReasoningPanel";
import { TeamBadge } from "./TeamBadge";
import type { PredictionRow, TeamLite } from "./types";

/**
 * Mobile-first row layout. The previous version put every child on a single
 * flex row and let it wrap — which on a 375px viewport produced the chaotic
 * stack of avatar / name / confidence / coupon button / played button / arrow
 * the user flagged. This rewrite explicitly stacks on mobile (player header
 * on row 1, pick + confidence + actions on row 2) and only expands to the
 * inline row on `sm:` and up where there's actually horizontal room.
 */
export function PickRow({
  prediction,
  team,
  trailing,
  hasPattern,
}: {
  prediction: PredictionRow;
  team: TeamLite | null;
  trailing?: ReactNode;
  hasPattern?: boolean;
}) {
  const market = marketLabel(prediction.market);
  const colors = teamColors(team?.abbreviation);
  const name = `${prediction.player.first_name} ${prediction.player.last_name}`;
  const topCheck = topReasoningCheck(prediction.reasoning);

  const cartPick = {
    prediction_id: prediction.id,
    game_id: prediction.game_id,
    player_id: prediction.player_id,
    player_first_name: prediction.player.first_name,
    player_last_name: prediction.player.last_name,
    team_id: prediction.player.team_id,
    team_abbreviation: team?.abbreviation ?? null,
    market: prediction.market,
    line: prediction.line,
    pick: prediction.pick,
    confidence: prediction.confidence,
    jersey_number: prediction.player.jersey_number,
  };

  return (
    <details className="group glass glass-sheen rounded-2xl overflow-hidden relative transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-30px_rgba(16,185,129,0.45)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl pointer-events-none"
        style={{
          background: `linear-gradient(180deg, ${colors.primary}, ${colors.secondary})`,
        }}
      />
      <summary className="cursor-pointer list-none p-3 sm:p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-inset">
        {/* MOBILE LAYOUT (default; sm:hidden) — two stacked rows */}
        <div className="sm:hidden space-y-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <PlayerAvatar
              playerId={prediction.player.id}
              firstName={prediction.player.first_name}
              lastName={prediction.player.last_name}
              abbreviation={team?.abbreviation ?? ""}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-medium text-sm truncate">{name}</span>
                <TeamBadge team={team} size={14} />
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <JerseyChip number={prediction.player.jersey_number} />
                {prediction.player.position ? (
                  <span className="text-[10px] text-foreground/45 font-mono uppercase">
                    {prediction.player.position}
                  </span>
                ) : null}
                {hasPattern ? (
                  <span
                    className="rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1 py-0.5 text-[9px] uppercase tracking-wider font-medium"
                    title="Active pattern detected"
                  >
                    ◆
                  </span>
                ) : null}
              </div>
            </div>
            <ConfidencePill score={prediction.confidence} />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1.5 text-sm min-w-0">
              <PickSideTag side={prediction.pick} />
              <span className="font-mono tabular-nums">{prediction.line}</span>
              <span className="text-foreground/60 truncate">{market}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <AddToCouponButton pick={cartPick} />
              {trailing}
              <span
                aria-hidden
                className="text-foreground/40 transition-transform group-open:rotate-90 text-sm"
              >
                ›
              </span>
            </div>
          </div>

          {topCheck ? (
            <div className="flex items-center gap-1.5 text-[11px] text-foreground/55">
              <span aria-hidden className="text-emerald-400">✓</span>
              <span className="truncate">{topCheck.label}</span>
            </div>
          ) : null}
        </div>

        {/* DESKTOP LAYOUT (sm+) — single inline row */}
        <div className="hidden sm:flex items-center gap-4">
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
            <div className="mt-1 flex items-baseline gap-2 text-sm flex-wrap">
              <PickSideTag side={prediction.pick} />
              <span className="font-mono tabular-nums">{prediction.line}</span>
              <span className="text-foreground/60">{market}</span>
              {hasPattern ? (
                <span
                  className="rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-medium"
                  title="Active pattern detected for this player and market"
                >
                  ◆ pattern
                </span>
              ) : null}
            </div>
            {topCheck ? (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-foreground/55">
                <span aria-hidden className="text-emerald-400">✓</span>
                <span className="truncate">{topCheck.label}</span>
                <span className="text-foreground/35">· open for full reasoning</span>
              </div>
            ) : null}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-foreground/45">
              Projection
            </div>
            <div className="font-mono tabular-nums text-foreground/80">
              {prediction.projection.toFixed(1)}
            </div>
          </div>
          <ConfidencePill score={prediction.confidence} />
          <AddToCouponButton pick={cartPick} />
          {trailing}
          <span
            aria-hidden
            className="text-foreground/40 transition-transform group-open:rotate-90"
          >
            ›
          </span>
        </div>
      </summary>
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <ReasoningPanel reasoning={prediction.reasoning} />
      </div>
    </details>
  );
}
