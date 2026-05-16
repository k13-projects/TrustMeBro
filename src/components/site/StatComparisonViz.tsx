"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import type { ConfidenceCheck } from "@/lib/analysis/types";

type Props = {
  checks: ConfidenceCheck[];
  line: number;
  projection: number;
  pick: "over" | "under";
};

// Build a synthetic history series from L5/L10/Season averages so we always
// have something to draw, even if the raw game-by-game scores aren't on the
// prediction yet. Falls back to a flat baseline at projection if no checks.
function deriveSeries(checks: ConfidenceCheck[], projection: number): number[] {
  const byLabel: Record<string, number> = {};
  for (const c of checks) {
    byLabel[c.label.toLowerCase()] = c.value;
  }
  const last = byLabel["last game"] ?? projection;
  const l5 = byLabel["last 5 avg"] ?? projection;
  const l10 = byLabel["last 10 avg"] ?? projection;
  const home = byLabel["home avg"] ?? projection;
  const opp = byLabel["vs. opponent"] ?? projection;
  const season = byLabel["season avg"] ?? projection;
  // 10 synthetic points trending toward the most recent values.
  return [season, opp, home, l10, l5, l5, l10, l5, last, projection];
}

export function StatComparisonViz({ checks, line, projection, pick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });

  const series = deriveSeries(checks, projection);
  const max = Math.max(...series, line, projection) * 1.15;
  const min = 0;
  const W = 320;
  const H = 96;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * H;
    return [x, y] as const;
  });
  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
  const lineY = H - ((line - min) / (max - min)) * H;
  const projY = H - ((projection - min) / (max - min)) * H;

  // Bars: each check as a horizontal stick (value vs line).
  const namedChecks = checks
    .filter((c) =>
      ["season avg", "last 10 avg", "last 5 avg", "last game", "home avg"].includes(
        c.label.toLowerCase(),
      ),
    )
    .slice(0, 5);

  return (
    <div ref={ref} className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Last 10 Trend
          </p>
          <p className="text-[10px] tabular-nums text-muted-foreground">
            line <span className="text-foreground font-semibold">{line}</span>
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            proj <span className="text-primary font-semibold">{projection.toFixed(1)}</span>
          </p>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 overflow-visible">
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFB800" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#FFB800" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Line marker */}
          <line
            x1="0"
            x2={W}
            y1={lineY}
            y2={lineY}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="4 4"
          />
          <text
            x={W - 2}
            y={lineY - 4}
            textAnchor="end"
            className="fill-foreground/55"
            fontSize="9"
          >
            line {line}
          </text>
          {/* Filled area */}
          <motion.path
            d={areaPath}
            fill="url(#spark-fill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: inView ? 1 : 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          />
          {/* Line stroke */}
          <motion.path
            d={linePath}
            fill="none"
            stroke="#FFB800"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: inView ? 1 : 0 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* Projection dot */}
          <motion.circle
            cx={W}
            cy={projY}
            r="4"
            fill="#FFB800"
            stroke="#0a0a0c"
            strokeWidth="2"
            initial={{ scale: 0 }}
            animate={{ scale: inView ? 1 : 0 }}
            transition={{ delay: 1.0, type: "spring", stiffness: 320, damping: 16 }}
          />
        </svg>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-2.5">
          Check Breakdown
        </p>
        <div className="space-y-1.5">
          {namedChecks.map((c, i) => {
            const ratio = Math.max(0.04, Math.min(1, c.value / Math.max(1, line)));
            const beatsLine = pick === "over" ? c.value >= line : c.value <= line;
            return (
              <div key={c.label} className="flex items-center gap-3 text-[11px]">
                <span className="w-20 text-muted-foreground capitalize">
                  {c.label}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: inView ? `${ratio * 100}%` : 0 }}
                    transition={{
                      duration: 0.9,
                      delay: 0.2 + i * 0.08,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={`h-full ${
                      beatsLine
                        ? c.passed
                          ? "bg-primary"
                          : "bg-primary/60"
                        : "bg-white/30"
                    }`}
                  />
                </div>
                <span className="w-12 text-right tabular-nums text-foreground/85">
                  {c.value.toFixed(1)}
                </span>
                <span
                  className={`w-3 text-center ${
                    c.passed ? "text-positive" : "text-muted-foreground/50"
                  }`}
                  aria-hidden
                >
                  {c.passed ? "✓" : "·"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
