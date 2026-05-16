"use client";

import { Flame, Sparkles, TrendingUp, Trophy, Zap } from "lucide-react";
import type { EngineStats } from "@/lib/scoring/stats";

type Item = { Icon: typeof Trophy; text: string };

function buildItems(stats: EngineStats): Item[] {
  const items: Item[] = [];
  const hasSettled = stats.total_settled > 0;
  const hasPicks = stats.total_picks > 0;

  if (hasSettled && stats.win_rate !== null) {
    items.push({
      Icon: Trophy,
      text: `WIN RATE ${(stats.win_rate * 100).toFixed(0)}% (${stats.wins}-${stats.losses})`,
    });
  } else {
    items.push({ Icon: Trophy, text: "WIN RATE — TRACKING JUST STARTED" });
  }

  if (hasSettled) {
    const sign = stats.score >= 0 ? "+" : "";
    items.push({
      Icon: TrendingUp,
      text: `ENGINE SCORE ${sign}${stats.score.toFixed(1)} UNITS · +1.0/-0.5 LEDGER`,
    });
  }

  if (stats.current_streak.length > 0) {
    const label = stats.current_streak.kind === "win" ? "WIN" : "LOSS";
    items.push({
      Icon: Flame,
      text: `${stats.current_streak.length} ${label} STREAK ACTIVE`,
    });
  }

  if (hasSettled && stats.net_units_7d !== 0) {
    const sign = stats.net_units_7d > 0 ? "+" : "";
    items.push({
      Icon: Zap,
      text: `${sign}${stats.net_units_7d.toFixed(1)} UNITS LAST 7 DAYS`,
    });
  }

  if (hasPicks) {
    items.push({
      Icon: Sparkles,
      text: `${stats.total_picks} TOTAL PICKS · ${stats.pending} PENDING`,
    });
  } else {
    items.push({
      Icon: Sparkles,
      text: "DATA-DRIVEN PICKS DAILY · REAL ODDS, REAL EV",
    });
  }

  if (stats.first_pick_date) {
    items.push({
      Icon: Flame,
      text: `TRACKING SINCE ${stats.first_pick_date}`,
    });
  }

  items.push({ Icon: Trophy, text: "NBA · MORE SPORTS COMING" });

  return items;
}

export function MarqueeTicker({ stats }: { stats: EngineStats }) {
  const items = buildItems(stats);
  const rendered = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-primary/25 bg-gradient-to-r from-background via-[#1a1408] to-background">
      <div className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-background to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />
      <div className="marquee flex gap-10 py-2.5 whitespace-nowrap will-change-transform">
        {rendered.map(({ Icon, text }, i) => (
          <span
            key={`${text}-${i}`}
            className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-foreground/85"
          >
            <Icon size={14} className="text-primary" />
            {text}
            <span aria-hidden className="text-primary/60 ml-6">
              ★
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
