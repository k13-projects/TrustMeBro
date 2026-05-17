"use client";

import { Check, Clock, Flame, Sparkles, Trophy, X } from "lucide-react";
import type { EngineStats } from "@/lib/scoring/stats";

type Item = { Icon: typeof Trophy; text: string };

const MARKET_LABEL: Record<string, string> = {
  points: "PTS",
  rebounds: "REB",
  assists: "AST",
  threes_made: "3PM",
  minutes: "MIN",
  pra: "PRA",
  steals: "STL",
  blocks: "BLK",
};

// Activity feed, not a stat mirror. The hero stat panel already shows
// WIN RATE / SCORE / STREAK / PENDING as static tiles — repeating them in
// a scrolling marquee was the "same number in three places" problem the
// design review flagged. These items lean on *events* (latest BotD,
// tracking start, slate cadence) so the marquee complements rather than
// duplicates the hero.
function buildItems(stats: EngineStats): Item[] {
  const items: Item[] = [];

  // Latest BotD with outcome — the most editorially interesting line.
  const latest = stats.recent_botds[0];
  if (latest) {
    const market = MARKET_LABEL[latest.market] ?? latest.market.toUpperCase();
    const pick = latest.pick.toUpperCase();
    const name = `${latest.player_first_name} ${latest.player_last_name}`.trim().toUpperCase();
    const statusIcon =
      latest.status === "won"
        ? Check
        : latest.status === "lost"
          ? X
          : Clock;
    const statusTag =
      latest.status === "won"
        ? "WON"
        : latest.status === "lost"
          ? "LOST"
          : latest.status === "void"
            ? "VOID"
            : "TONIGHT";
    items.push({
      Icon: statusIcon,
      text: `BET OF THE DAY · ${name} ${pick} ${latest.line} ${market} · ${statusTag}`,
    });
  }

  if (stats.pending > 0) {
    items.push({
      Icon: Sparkles,
      text: `${stats.pending} PICK${stats.pending === 1 ? "" : "S"} BEING TRACKED TONIGHT`,
    });
  }

  if (stats.first_pick_date) {
    items.push({
      Icon: Flame,
      text: `TRACKING SINCE ${stats.first_pick_date} · NO RETRO EDITS`,
    });
  }

  items.push({
    Icon: Trophy,
    text: "+1.0 PER WIN · −0.5 PER LOSS · SETTLED DAILY @ 9 UTC",
  });

  items.push({
    Icon: Sparkles,
    text: "REAL BOOKMAKER ODDS · REAL EXPECTED VALUE",
  });

  items.push({
    Icon: Trophy,
    text: "NBA TODAY · MORE SPORTS COMING",
  });

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
