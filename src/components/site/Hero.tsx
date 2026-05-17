"use client";

import Image from "next/image";
import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { BarChart3, Clock, Flame, TrendingUp, Trophy } from "lucide-react";
import { CountUp } from "@/components/site/CountUp";
import { GoldButton } from "@/components/site/GoldButton";
import { MagneticLink } from "@/components/site/MagneticLink";
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

  // 1) WIN RATE — primary credibility metric
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

  // 2) SCORE — net units, +1/-0.5 ledger
  tiles.push({
    Icon: TrendingUp,
    label: "Score",
    value: Math.abs(stats.score),
    decimals: 1,
    prefix: stats.score > 0 ? "+" : stats.score < 0 ? "−" : "",
    note: "+1.0 / −0.5 ledger",
    emptyText: stats.total_settled === 0 ? "0.0" : undefined,
    tone: stats.score > 0 ? "positive" : stats.score < 0 ? "negative" : "neutral",
  });

  // 3) STREAK — coloured by direction so users can read it at a glance
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

  // 4) PENDING when there is work in flight; else fall back to last-7-days
  // delta. This avoids the "+15.0 / +15.0" duplicate-tile illusion that shows
  // up early on when the all-time score equals the last-week net.
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
  const ref = useRef<HTMLElement>(null);
  const tiles = buildStatTiles(stats);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Parallax: mascot drifts up faster than the text as you scroll out. Rotate
  // transform on the headline was removed — it skewed legibility for no
  // perceptible gain.
  const mascotY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const mascotScale = useTransform(scrollYProgress, [0, 1], [1, 1.04]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const blurOpacity = useTransform(scrollYProgress, [0, 1], [0.5, 0.05]);

  return (
    <section ref={ref} className="relative overflow-hidden">
      <BackgroundFx blurOpacity={blurOpacity} />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-12 pb-20 lg:pt-20 lg:pb-28 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <motion.div style={{ y: textY }} className="space-y-7">
          <motion.p
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground"
          >
            <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
            Data. Analysis. Winners.
          </motion.p>

          {/* One typeface, one rhythm. Anton uppercase (no synthetic italic,
              no brush mid-word) across all three words. Colour does the brand
              work: "TRUST ME" white, "BRO" warm-gold. leading-[0.95] keeps
              the two-line stack tight without the descenders of line 1
              crashing into the ascenders of line 2 the way 0.88 did. */}
          <motion.h1
            className="font-display uppercase leading-[0.95] tracking-tight text-[clamp(3.4rem,9vw,6.8rem)]"
          >
            <span
              className="hero-word block text-foreground"
              style={{ animationDelay: "0ms" }}
            >
              TRUST ME
            </span>
            <span
              className="hero-word block"
              style={{
                animationDelay: "110ms",
                background:
                  "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              BRO
            </span>
          </motion.h1>

          <p className="max-w-md text-base text-foreground/70">
            Real bookmaker odds. Real expected value. Every pick graded the
            morning after, win or lose.
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <MagneticLink strength={0.2}>
              <GoldButton href="/#picks" withLock size="lg">
                Get Today&apos;s Picks
              </GoldButton>
            </MagneticLink>
            <MagneticLink strength={0.15}>
              <GoldButton href="/score" variant="outline" size="lg">
                View Results
              </GoldButton>
            </MagneticLink>
          </div>

          <StatLedgerPanel
            tiles={tiles}
            firstPickDate={stats.first_pick_date}
          />
        </motion.div>

        <div className="relative h-full">
          <MascotStage y={mascotY} scale={mascotScale} />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="hidden lg:flex absolute bottom-6 left-1/2 -translate-x-1/2 items-center gap-2 text-[10px] uppercase tracking-[0.32em] text-muted-foreground"
      >
        <span className="inline-block w-8 h-px bg-primary/60" />
        Scroll
        <span className="inline-block w-8 h-px bg-primary/60" />
      </motion.div>
    </section>
  );
}

function BackgroundFx({ blurOpacity }: { blurOpacity: MotionValue<number> }) {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(60rem 36rem at 74% 32%, rgba(255, 184, 0, 0.22), transparent 60%)," +
            "radial-gradient(44rem 28rem at 14% 72%, rgba(255, 107, 53, 0.10), transparent 65%)",
        }}
      />
      <motion.div
        aria-hidden
        style={{ opacity: blurOpacity }}
        className="absolute top-16 right-[10%] size-[320px] -z-10"
      >
        <div
          className="size-full blur-3xl"
          style={{
            background:
              "radial-gradient(45% 45% at 50% 50%, rgba(255,184,0,0.22), transparent 70%)",
          }}
        />
      </motion.div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 -z-10"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, var(--background) 100%)",
        }}
      />
    </>
  );
}

function MascotStage({
  y,
  scale,
}: {
  y: MotionValue<number>;
  scale: MotionValue<number>;
}) {
  return (
    <motion.div
      style={{ y, scale }}
      initial={{ opacity: 0, scale: 0.9, rotate: -3 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-[22rem] sm:max-w-md lg:max-w-[28rem] aspect-square"
    >
      {/* Subtle conic backdrop — same gold tone but lower opacity so the
          sticker (now transparent-background) carries the visual weight. */}
      <motion.div
        aria-hidden
        animate={{ rotate: 360 }}
        transition={{ duration: 90, ease: "linear", repeat: Infinity }}
        className="absolute inset-[10%] rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0%, rgba(255,184,0,0.10) 25%, transparent 50%, rgba(255,184,0,0.06) 75%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-[18%] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(38% 38% at 50% 50%, rgba(255,184,0,0.32), transparent 72%)",
        }}
      />
      <div className="mascot-bob absolute inset-0 grid place-items-center">
        <Image
          src="/Design/mascot-hero.png"
          alt="TrustMeBro mascot"
          width={620}
          height={620}
          priority
          unoptimized
          className="select-none drop-shadow-[0_24px_50px_rgba(255,184,0,0.35)]"
        />
      </div>
      <Coin angle={20} distance="46%" delay={0} />
      <Coin angle={120} distance="48%" delay={0.6} />
      <Coin angle={240} distance="44%" delay={1.2} />
    </motion.div>
  );
}

function Coin({
  angle,
  distance,
  delay,
}: {
  angle: number;
  distance: string;
  delay: number;
}) {
  const rad = (angle * Math.PI) / 180;
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 1, 0.7, 1],
        scale: [0, 1, 1, 0.95, 1],
      }}
      transition={{ delay, duration: 3.6, repeat: Infinity, repeatDelay: 1.2 }}
      className="absolute size-5 rounded-full"
      style={{
        left: `calc(50% + ${Math.cos(rad)} * ${distance})`,
        top: `calc(50% + ${Math.sin(rad)} * ${distance})`,
        background:
          "radial-gradient(circle at 30% 30%, #FFE066, #FFB800 60%, #B27B00 100%)",
        boxShadow: "0 6px 16px -4px rgba(255,184,0,0.65)",
      }}
    />
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
      className="card-tmb max-w-lg backdrop-blur-2xl bg-background/65"
    >
      <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
        {tiles.map((tile) => (
          <TileCell key={tile.label} tile={tile} />
        ))}
      </div>
      <div className="px-4 sm:px-5 pb-3 pt-1 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {firstPickDate
            ? `Tracking since ${firstPickDate}`
            : "First slate today"}
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
