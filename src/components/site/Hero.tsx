"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { BarChart3, Clock, Flame, TrendingUp, Trophy } from "lucide-react";
import { CountUp } from "@/components/site/CountUp";
import { GoldButton } from "@/components/site/GoldButton";
import type { EngineStats } from "@/lib/scoring/stats";

type StatTone = "positive" | "negative" | "neutral";

type StatTile = {
  Icon: typeof Trophy;
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  prefix?: string;
  note: string;
  tone?: StatTone;
  /** When set, renders this string instead of a counted-up number. */
  emptyText?: string;
};

function buildStatTiles(stats: EngineStats): StatTile[] {
  const tiles: StatTile[] = [];

  tiles.push({
    Icon: Trophy,
    label: "Win Rate",
    value: stats.win_rate !== null ? Math.round(stats.win_rate * 100) : 0,
    suffix: "%",
    note:
      stats.win_rate !== null
        ? `${stats.wins}-${stats.losses} settled`
        : stats.first_pick_date
          ? `Since ${stats.first_pick_date}`
          : "First slate today",
    emptyText: stats.win_rate === null ? "—" : undefined,
    tone:
      stats.win_rate === null
        ? "neutral"
        : stats.win_rate >= 0.55
          ? "positive"
          : stats.win_rate < 0.5
            ? "negative"
            : "neutral",
  });

  tiles.push({
    Icon: TrendingUp,
    label: "Score",
    value: Math.abs(stats.score),
    decimals: 1,
    prefix: stats.score > 0 ? "+" : stats.score < 0 ? "−" : "",
    note: "+1.0 / −1.0 ledger",
    emptyText: stats.total_settled === 0 ? "0.0" : undefined,
    tone: stats.score > 0 ? "positive" : stats.score < 0 ? "negative" : "neutral",
  });

  const streakSuffix =
    stats.current_streak.kind === "win"
      ? "W"
      : stats.current_streak.kind === "loss"
        ? "L"
        : "";
  const streakNote =
    stats.current_streak.kind === "win"
      ? "in a row"
      : stats.current_streak.kind === "loss"
        ? "in a row"
        : "awaiting result";
  tiles.push({
    Icon: Flame,
    label: "Streak",
    value: stats.current_streak.length,
    suffix: streakSuffix,
    note: streakNote,
    emptyText: stats.current_streak.kind === "none" ? "—" : undefined,
    tone:
      stats.current_streak.kind === "win"
        ? "positive"
        : stats.current_streak.kind === "loss"
          ? "negative"
          : "neutral",
  });

  if (stats.pending > 0) {
    tiles.push({
      Icon: Clock,
      label: "Pending",
      value: stats.pending,
      note: "to settle tonight",
      tone: "neutral",
    });
  } else {
    tiles.push({
      Icon: BarChart3,
      label: "Last 7 days",
      value: Math.abs(stats.net_units_7d),
      decimals: 1,
      prefix: stats.net_units_7d > 0 ? "+" : stats.net_units_7d < 0 ? "−" : "",
      note: "Net units",
      emptyText: stats.total_settled === 0 ? "0.0" : undefined,
      tone:
        stats.net_units_7d > 0
          ? "positive"
          : stats.net_units_7d < 0
            ? "negative"
            : "neutral",
    });
  }

  return tiles;
}

export function Hero({ stats }: { stats: EngineStats }) {
  const tiles = buildStatTiles(stats);

  // Layout strategy:
  //   - Mobile (< lg): flex column stacking, pill → wordmark → mascot →
  //     subtitle → buttons → stats. DOM order matches visual order.
  //   - Desktop (lg+): CSS grid switches on with [auto 1fr] columns.
  //     Mascot is explicitly placed in col 1 spanning all rows; the rest
  //     fall into col 2 by explicit row placement, so the right column
  //     reads pill → wordmark → subtitle → buttons → stats.
  // The mobile mascot position (between wordmark and subtitle) is purely
  // DOM order — grid placement classes are no-ops below lg.
  return (
    <section className="relative overflow-hidden">
      <BackgroundFx />

      <div
        className="
          relative mx-auto max-w-3xl lg:max-w-5xl px-4 sm:px-6
          pt-10 pb-16 lg:pt-16 lg:pb-24
          flex flex-col items-center text-center space-y-6
          lg:grid lg:grid-cols-[auto_1fr] lg:gap-x-8 lg:gap-y-7 lg:items-center lg:text-left lg:space-y-0
        "
      >
        <motion.p
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:col-start-2 lg:row-start-1 lg:justify-self-start inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground"
        >
          <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
          Data. Analysis. Winners.
        </motion.p>

        <h1 className="lg:col-start-2 lg:row-start-2 font-display uppercase leading-[0.95] tracking-tight text-[clamp(3rem,8.5vw,6rem)]">
          <span className="hero-word block text-foreground" style={{ animationDelay: "0ms" }}>
            TRUST ME
          </span>
          <span
            className="hero-word block"
            style={{
              animationDelay: "110ms",
              background: "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            BRO
          </span>
        </h1>

        <div className="lg:col-start-1 lg:row-start-1 lg:row-span-5 lg:self-center">
          <MascotStage />
        </div>

        <p className="lg:col-start-2 lg:row-start-3 max-w-md text-base text-foreground/70">
          Real bookmaker odds. Real expected value. Every pick graded the
          morning after, win or lose.
        </p>

        <div className="lg:col-start-2 lg:row-start-4 flex items-center gap-3 flex-wrap justify-center lg:justify-start">
          <GoldButton href="/#picks" size="lg">
            Get Today&apos;s Picks
          </GoldButton>
          <GoldButton href="/scorecard" variant="outline" size="lg">
            View Scorecard
          </GoldButton>
        </div>

        <div className="lg:col-start-2 lg:row-start-5 w-full flex justify-center lg:justify-start">
          <StatLedgerPanel tiles={tiles} firstPickDate={stats.first_pick_date} />
        </div>
      </div>
    </section>
  );
}

function BackgroundFx() {
  // Single static radial. Previous version stacked three radials + a
  // body::before screen-blend pattern that pegged the compositor on every
  // scroll frame.
  return (
    <div
      aria-hidden
      className="absolute inset-0 -z-10"
      style={{
        backgroundImage:
          "radial-gradient(60rem 36rem at 50% 25%, rgba(255, 184, 0, 0.16), transparent 60%)",
      }}
    />
  );
}

function MascotStage() {
  // Mobile: stacked between wordmark and subtitle, centered (mx-auto).
  // Desktop: anchors the left column of the 2-col grid (mx-0), slightly
  // larger since it owns its own column instead of squeezing into the
  // text stack.
  return (
    <div className="relative w-full max-w-[14rem] sm:max-w-[16rem] lg:max-w-[20rem] aspect-square mx-auto lg:mx-0">
      <div
        aria-hidden
        className="absolute inset-[18%] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(38% 38% at 50% 50%, rgba(255,184,0,0.26), transparent 72%)",
        }}
      />
      <div className="mascot-bob absolute inset-0 grid place-items-center">
        <Image
          src="/Design/mascot-hero.png"
          alt="TrustMeBro mascot"
          width={400}
          height={400}
          priority
          sizes="(max-width: 640px) 224px, (max-width: 1024px) 256px, 320px"
          className="select-none drop-shadow-[0_18px_40px_rgba(255,184,0,0.28)]"
        />
      </div>
    </div>
  );
}

function StatLedgerPanel({
  tiles,
  firstPickDate,
}: {
  tiles: StatTile[];
  firstPickDate: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="card-tmb w-full max-w-lg bg-background/65 text-left"
    >
      <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
        {tiles.map((tile) => (
          <TileCell key={tile.label} tile={tile} />
        ))}
      </div>
      <div className="px-4 sm:px-5 pb-3 pt-1 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {firstPickDate ? `Tracking since ${firstPickDate}` : "First slate today"}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-positive">
          <span className="size-1.5 rounded-full bg-positive soft-pulse" />
          live
        </span>
      </div>
    </motion.div>
  );
}

function TileCell({ tile }: { tile: StatTile }) {
  const { Icon, label, value, suffix, decimals, prefix, note, tone, emptyText } = tile;
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-foreground";
  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <Icon size={11} className="text-primary" strokeWidth={2.4} />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`font-numeric text-2xl tabular-nums leading-none whitespace-nowrap ${toneClass}`}
      >
        {emptyText ? (
          <span>{emptyText}</span>
        ) : (
          <CountUp
            to={value}
            decimals={decimals ?? 0}
            prefix={prefix ?? ""}
            suffix={suffix ?? ""}
            duration={1.3}
          />
        )}
      </div>
      <div className="text-[10px] text-muted-foreground/75 truncate">{note}</div>
    </div>
  );
}
