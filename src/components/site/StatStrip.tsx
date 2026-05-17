"use client";

import { Shield, Calendar, PieChart, Activity } from "lucide-react";
import { CountUp } from "@/components/site/CountUp";
import type { EngineStats } from "@/lib/scoring/stats";

type StatItem = {
  Icon: typeof Shield;
  label: string;
  value: number;
  suffix: string;
  decimals?: number;
  prefix?: string;
  /** Displayed in place of the number when we don't have data yet. */
  emptyText?: string;
};

function buildItems(stats: EngineStats): StatItem[] {
  const hasAnyPicks = stats.total_picks > 0;
  const hasSettled = stats.total_settled > 0;
  return [
    {
      Icon: Shield,
      label: "Picks Graded",
      value: stats.total_settled,
      suffix: stats.pending > 0 ? ` / ${stats.total_picks}` : "",
      emptyText: hasAnyPicks ? undefined : "—",
    },
    {
      Icon: Calendar,
      label: "Days Tracked",
      value: Math.max(stats.days_tracked, stats.first_pick_date ? 1 : 0),
      suffix: "",
      emptyText: stats.first_pick_date ? undefined : "Day 1",
    },
    {
      Icon: PieChart,
      label: "Win Rate",
      value: stats.win_rate !== null ? Math.round(stats.win_rate * 100) : 0,
      suffix: "%",
      emptyText: stats.win_rate === null ? "—" : undefined,
    },
    {
      Icon: Activity,
      label: "Net Units",
      value: Math.abs(stats.score),
      decimals: 1,
      prefix: stats.score > 0 ? "+" : stats.score < 0 ? "−" : "",
      suffix: "",
      emptyText: hasSettled ? undefined : "0.0",
    },
  ];
}

export function StatStrip({ stats }: { stats: EngineStats }) {
  const items = buildItems(stats);
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
      <div className="card-tmb px-6 py-7 sm:px-10 sm:py-9">
        <div className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Live Engine Ledger
          </p>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/75">
            +1.0 win · −0.5 loss · settled daily
            {stats.first_pick_date ? ` · since ${stats.first_pick_date}` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map(({ Icon, label, value, suffix, decimals, prefix, emptyText }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="grid place-items-center size-11 rounded-xl bg-primary/15 ring-1 ring-primary/30">
                <Icon size={20} className="text-primary" />
              </span>
              <div className="min-w-0">
                <div className="font-numeric text-xl tabular-nums leading-none">
                  {emptyText ? (
                    <span className="text-foreground/85">{emptyText}</span>
                  ) : (
                    <>
                      {prefix ? <span className="text-foreground">{prefix}</span> : null}
                      <CountUp to={value} decimals={decimals ?? 0} duration={1.6} />
                      <span className="text-primary">{suffix}</span>
                    </>
                  )}
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                  {label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
