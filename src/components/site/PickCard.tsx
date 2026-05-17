"use client";

import { Lock } from "lucide-react";
import { motion } from "motion/react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { marketLabel } from "@/components/MarketLabel";
import type { PredictionRow, TeamLite } from "@/components/types";
import { GoldButton } from "@/components/site/GoldButton";
import { PAYWALL_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

type Props = {
  prediction: PredictionRow;
  team: TeamLite | null;
  opponentTeam?: TeamLite | null;
  league?: string;
  gameTimeLabel?: string;
  odds?: string;
  locked?: boolean;
  free?: boolean;
  href?: string;
  className?: string;
};

function pickHeadline(p: PredictionRow): { side: string; valueLabel: string } {
  const side = p.pick === "over" ? "OVER" : "UNDER";
  const label = marketLabel(p.market).toUpperCase();
  return { side, valueLabel: `${side} ${p.line} ${label}` };
}

export function PickCard({
  prediction,
  team,
  opponentTeam = null,
  league = "NBA",
  gameTimeLabel,
  odds,
  locked = true,
  free = false,
  href = "/login",
  className,
}: Props) {
  const { side, valueLabel } = pickHeadline(prediction);
  const conf10 = Math.round((prediction.confidence / 10) * 10) / 10;
  const matchup = opponentTeam
    ? `${team?.abbreviation ?? ""} vs ${opponentTeam.abbreviation}`
    : team?.full_name ?? "";

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn("card-pick group flex flex-col", className)}
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]",
            PAYWALL_ENABLED && free
              ? "bg-positive/15 text-positive ring-1 ring-positive/30"
              : "bg-primary/15 text-primary ring-1 ring-primary/30"
          )}
        >
          {PAYWALL_ENABLED ? (
            <>
              {free ? "Free Pick" : "VIP Pick"}
              <span className="opacity-70">·</span>
            </>
          ) : null}
          {league}
        </span>
        {gameTimeLabel ? (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {gameTimeLabel}
          </span>
        ) : null}
      </div>

      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
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
            </span>
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
        <GoldButton
          href={href}
          withLock={locked}
          size="md"
          className="w-full justify-center"
        >
          {locked ? "Unlock Pick" : "View Pick"}
        </GoldButton>
      </div>

      {locked ? (
        <Lock
          aria-hidden
          size={16}
          strokeWidth={2.5}
          className="absolute top-4 right-4 text-primary/80 group-hover:text-primary lock-wiggle"
        />
      ) : null}
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
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="h-full bg-gradient-to-r from-primary/70 via-primary to-[var(--primary-hover)]"
          style={{ boxShadow: "0 0 12px rgba(255,184,0,0.5)" }}
        />
      </div>
    </div>
  );
}
