"use client";

import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type InsightHint = {
  pattern_type: string;
  description: string;
};

const LABEL: Record<string, string> = {
  cold_streak: "Cold streak",
  home_away_split: "Home/away split",
  rest_day_dip: "Rest-day dip",
};

/**
 * Sparkles badge that surfaces detected patterns on a pick — cold streak,
 * home/away split, etc. The reasoning panel still has the full breakdown;
 * this chip is the inline at-a-glance signal in card layouts.
 */
export function InsightChip({ hints }: { hints: InsightHint[] }) {
  if (!hints || hints.length === 0) return null;

  const headlineLabel = LABEL[hints[0].pattern_type] ?? "Pattern";
  const allLabels = hints
    .map((h) => LABEL[h.pattern_type] ?? h.pattern_type)
    .join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label={`Pattern insights: ${allLabels}`}
      >
        <Sparkles size={10} strokeWidth={2.5} />
        {hints.length > 1 ? `${hints.length} insights` : headlineLabel}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-xs">
        <div className="space-y-1.5">
          {hints.map((h, i) => (
            <div key={`${h.pattern_type}-${i}`} className="text-xs leading-snug">
              <span className="font-semibold">
                {LABEL[h.pattern_type] ?? h.pattern_type}:
              </span>{" "}
              <span className="text-background/85">{h.description}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
