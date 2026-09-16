"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Minus, X } from "lucide-react";
import type { ConfidenceCheck } from "@/lib/analysis/types";
import type { SettledPickDetail } from "@/lib/sports/soccer/queries";
import type { RowBadge } from "@/lib/sports/soccer/results";
import { sideLabel } from "@/lib/sports/soccer/labels";
import { LocalTime } from "@/components/site/LocalTime";
import { TeamCrest } from "./TeamCrest";
import { TierBadge } from "./TierBadge";

// "banko" is handled by TierBadge below (shown on every row, Banko or Lean,
// not just as an occasional achievement badge), so it's excluded from this
// map — see the filter where `badges` is rendered.
const BADGE_COPY: Record<Exclude<RowBadge, "banko">, { icon: string; label: string }> = {
  upset: { icon: "⚡", label: "Upset Called" },
  "best-price": { icon: "🎯", label: "Best Price" },
};

// The three checks the engine currently emits (src/lib/analysis/soccer/engine.ts)
// each carry `value`/`target` in different units, so the same generic pair
// reads as "58% vs 50%", "41 books" or "+0.8" only if formatted per-label.
// A future check the engine hasn't shipped yet still renders — just as a
// plain "value vs target" pair instead of the dressed-up unit.
function formatCheck(check: ConfidenceCheck): string {
  if (check.label === "De-vigged consensus probability") {
    return `${check.value}% vs ${check.target}%`;
  }
  if (check.label === "Bookmaker agreement") {
    return `${check.value} ${check.value === 1 ? "book" : "books"}`;
  }
  if (check.label === "Table form edge") {
    return `${check.value > 0 ? "+" : ""}${check.value}`;
  }
  return `${check.value} vs ${check.target}`;
}

export function ResultsRow({
  pick,
  badges,
  highlighted = false,
}: {
  pick: SettledPickDetail;
  badges: RowBadge[];
  highlighted?: boolean;
}) {
  const [open, setOpen] = useState(highlighted);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlighted || !ref.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    // Highlight is a one-time deep-link arrival, not an ongoing state to re-fire on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const played = pick.home_score !== null && pick.away_score !== null;
  const homeWon = played && pick.home_score! > pick.away_score!;
  const awayWon = played && pick.away_score! > pick.home_score!;

  const tone =
    pick.status === "won"
      ? { Icon: Check, cls: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30", text: "Won" }
      : pick.status === "lost"
        ? { Icon: X, cls: "bg-rose-400/15 text-rose-300 ring-rose-400/30", text: "Lost" }
        : { Icon: Minus, cls: "bg-white/8 text-foreground/60 ring-white/10", text: "Void" };

  const checks = pick.reasoning.checks;
  const signals = pick.reasoning.signals ?? [];

  return (
    <div
      ref={ref}
      id={`pick-${pick.id}`}
      className={`scroll-mt-24 border-b border-border/40 last:border-b-0 ${
        highlighted ? "bg-primary/[0.06] ring-1 ring-inset ring-primary/40" : ""
      }`}
    >
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ring-1 ${tone.cls}`}
            >
              <tone.Icon size={11} strokeWidth={3} aria-hidden />
              {tone.text}
            </span>
            <TierBadge isBanko={pick.is_banko} />
            {badges
              .filter((b): b is Exclude<RowBadge, "banko"> => b !== "banko")
              .map((b) => (
                <span
                  key={b}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary ring-1 ring-primary/30"
                >
                  <span aria-hidden>{BADGE_COPY[b].icon}</span>
                  {BADGE_COPY[b].label}
                </span>
              ))}
          </div>

          <Link
            href={`/football/match/${pick.match_id}`}
            className="mt-2 flex min-w-0 items-center gap-2 hover:opacity-90"
          >
            <TeamCrest crest={pick.home_crest} name={pick.home} size={20} />
            <span className={`min-w-0 truncate text-sm ${homeWon ? "font-semibold text-foreground/85" : "text-foreground/70"}`}>
              {pick.home}
            </span>
            {played ? (
              <span className="shrink-0 text-sm font-bold tabular-nums text-foreground/90">
                {pick.home_score}–{pick.away_score}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-foreground/40">v</span>
            )}
            <span className={`min-w-0 truncate text-sm ${awayWon ? "font-semibold text-foreground/85" : "text-foreground/70"}`}>
              {pick.away}
            </span>
            <TeamCrest crest={pick.away_crest} name={pick.away} size={20} />
          </Link>

          <div className="mt-1.5 text-sm font-semibold">
            {sideLabel(pick.market, pick.side, pick.line, pick.home, pick.away)}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-foreground/45">
            <LocalTime iso={pick.datetime} fallback="—" format="date" />
            {pick.bookmaker ? (
              <>
                <span aria-hidden>·</span>
                <span className="lowercase">{pick.bookmaker}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-start sm:gap-0.5">
          <div className="text-sm font-bold tabular-nums">{pick.best_odds.toFixed(2)}</div>
          <div className="text-[11px] tabular-nums text-foreground/45">
            {Math.round(pick.confidence)}%
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-border/30 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/45 transition-colors hover:text-foreground/70"
      >
        Why this call
        <ChevronDown
          size={13}
          className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="border-t border-border/30 bg-black/15 px-4 py-3">
          {checks.length === 0 ? (
            <p className="text-xs text-foreground/40">
              No recorded reasoning for this pick.
            </p>
          ) : (
            <div className="space-y-2">
              {checks.map((check, i) => (
                <div key={`${check.label}-${i}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs text-foreground/70">
                    {check.label}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-foreground/50">
                    {formatCheck(check)}
                  </span>
                  {check.passed ? (
                    <Check size={13} strokeWidth={3} className="shrink-0 text-emerald-400" aria-label="passed" />
                  ) : (
                    <X size={13} strokeWidth={3} className="shrink-0 text-rose-400" aria-label="failed" />
                  )}
                  <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.round(check.weight * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {signals.length > 0 ? (
            <div className="mt-3 space-y-1 border-t border-border/20 pt-2">
              {signals.map((s, i) => (
                <p key={`${s.source}-${i}`} className="text-xs text-foreground/50">
                  <span className="font-semibold text-foreground/70">{s.source}</span> — {s.note}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
