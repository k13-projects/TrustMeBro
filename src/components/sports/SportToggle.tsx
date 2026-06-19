"use client";

import Image from "next/image";
import { useState } from "react";
import { SPORTS, SPORT_ORDER } from "@/lib/sports/registry";
import { cx, focusRing } from "@/lib/design/tokens";
import type { Sport } from "@/lib/sports/types";

// Knob geometry (px). The knob is deliberately larger than the track so it
// overflows top/bottom/ends — that physical "poke-out" is what reads as a
// real switch knob rather than a flat segmented button.
const TRACK_W = 72;
const KNOB = 44;
const OVERFLOW = 5; // how far the knob pokes past the active end
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const [LEFT_SPORT] = SPORT_ORDER; // soccer sits on the left, nba on the right

// The single global sport switch, rendered as a physical knob toggle. The knob
// carries the *active* sport's logo and slides to that sport's side; the dim
// hint on the empty side previews where a tap will take you. We set the cookie
// client-side (committed synchronously) and then do a full navigation, so SSR
// and the edge proxy both read the new sport on the very next request — no
// server-action/redirect cookie race (which used to bounce NBA → World Cup).
export function SportToggle({ active }: { active: Sport }) {
  const [optimistic, setOptimistic] = useState<Sport>(active);
  const current = optimistic;
  const onLeft = current === LEFT_SPORT;
  const target = onLeft ? SPORT_ORDER[1] : SPORT_ORDER[0];

  const activeMeta = SPORTS[current];
  const targetMeta = SPORTS[target];

  const knobX = onLeft ? -OVERFLOW : TRACK_W - KNOB + OVERFLOW;

  function switchSport() {
    setOptimistic(target);
    document.cookie = `tmb_sport=${target}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    window.location.assign(targetMeta.home);
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        role="switch"
        aria-checked={!onLeft}
        aria-label={`Sport: ${activeMeta.competition}. Switch to ${targetMeta.competition}`}
        title={`Switch to ${targetMeta.competition}`}
        onClick={switchSport}
        style={{ width: TRACK_W, height: KNOB }}
        className={cx(
          "group relative grid place-items-center isolate cursor-pointer",
          focusRing,
          "rounded-full",
        )}
      >
        {/* Track — shorter than the button box so the knob overflows it. */}
        <span
          aria-hidden
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-8 rounded-full border border-border/70 bg-background/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] transition-colors group-hover:border-primary/50"
        />

        {/* Hint: the sport you'll switch to, dim, on the empty side. */}
        <span
          aria-hidden
          className={cx(
            "absolute top-1/2 -translate-y-1/2 z-[1] grid place-items-center transition-all duration-300",
            onLeft ? "right-2.5" : "left-2.5",
          )}
        >
          <Image
            src={targetMeta.logo}
            alt=""
            width={20}
            height={20}
            className="size-5 object-contain opacity-35 grayscale group-hover:opacity-60 group-hover:grayscale-0 transition-all"
            unoptimized
          />
        </span>

        {/* Knob: the active sport's logo, oversized, sliding between sides. */}
        <span
          aria-hidden
          style={{
            width: KNOB,
            height: KNOB,
            transform: `translate(${knobX}px, -50%)`,
          }}
          className="absolute left-0 top-1/2 z-[2] grid place-items-center rounded-full border-2 border-primary/90 bg-gradient-to-b from-[#1b1c22] to-[#0c0d11] shadow-[0_6px_16px_-4px_rgba(0,0,0,0.7),0_0_0_1px_rgba(0,0,0,0.5),0_0_14px_-4px_rgba(255,184,0,0.55)] transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] group-hover:border-primary group-active:scale-95"
        >
          <Image
            src={activeMeta.logo}
            alt={`${activeMeta.competition} logo`}
            width={30}
            height={30}
            className="size-[30px] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
            unoptimized
          />
        </span>
      </button>
    </div>
  );
}
