"use client";

import { motion } from "motion/react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { marketLabel } from "@/components/MarketLabel";
import type { PredictionRow, TeamLite } from "@/components/types";
import { AddToCouponButton } from "@/components/cart/AddToCouponButton";
import { GoldButton } from "@/components/site/GoldButton";
import { cn } from "@/lib/utils";

type Props = {
  prediction: PredictionRow;
  team: TeamLite | null;
  opponentTeam?: TeamLite | null;
  gameTimeLabel?: string;
  odds?: string;
  href?: string;
  className?: string;
};

export function PickCard({
  prediction,
  team,
  opponentTeam = null,
  gameTimeLabel,
  odds,
  href,
  className,
}: Props) {
  const side = prediction.pick === "over" ? "OVER" : "UNDER";
  const market = marketLabel(prediction.market).toUpperCase();
  const matchup = opponentTeam
    ? `${team?.abbreviation ?? ""} vs ${opponentTeam.abbreviation}`
    : team?.full_name ?? "";
  const target = href ?? `/players/${prediction.player.id}`;

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
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn("card-pick group flex flex-col", className)}
    >
      {gameTimeLabel ? (
        <div className="flex items-center justify-end px-4 pt-4">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {gameTimeLabel}
          </span>
        </div>
      ) : null}

      <div className="px-4 pt-4 pb-2 flex items-start gap-3">
        <div className="shrink-0">
          <PlayerAvatar
            playerId={prediction.player.id}
            firstName={prediction.player.first_name}
            lastName={prediction.player.last_name}
            abbreviation={team?.abbreviation ?? ""}
            size={72}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground truncate">
            {matchup}
          </p>
          <p className="font-display uppercase text-[22px] leading-[1] tracking-tight text-foreground">
            {prediction.player.first_name} {prediction.player.last_name}
          </p>
          <p className="font-display uppercase text-[18px] leading-[1] text-primary">
            {side}{" "}
            <span className="font-numeric not-italic tabular-nums">
              {prediction.line}
            </span>{" "}
            <span className="text-foreground/70 text-[14px]">{market}</span>
          </p>
          {odds ? (
            <p className="text-[11px] text-muted-foreground">
              Odds: <span className="text-foreground/85 tabular-nums">{odds}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="px-4 pb-4 mt-auto space-y-3">
        <ConfidenceBar value={prediction.confidence} />
        <div className="flex items-center gap-2">
          <GoldButton
            href={target}
            size="md"
            className="flex-1 justify-center whitespace-nowrap !text-[11px] !tracking-[0.1em] !px-3"
          >
            View Details
          </GoldButton>
          <AddToCouponButton pick={cartPick} variant="card" />
        </div>
      </div>
    </motion.article>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(2, Math.min(100, value));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>Confidence</span>
        <span className="tabular-nums text-foreground/85">
          {(value / 10).toFixed(1)}/10
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="h-full bg-gradient-to-r from-primary/70 via-primary to-[var(--primary-hover)]"
          style={{ boxShadow: "0 0 12px rgba(255,184,0,0.5)" }}
        />
      </div>
    </div>
  );
}
