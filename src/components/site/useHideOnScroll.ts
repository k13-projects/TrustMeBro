"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Visibility signal for the floating action stack (Ask Bro / My Coupon).
 * Starts hidden so the page's own content gets an unobstructed first paint,
 * then fades in; hides again while the user is actively scrolling down (out
 * of the way of whatever they're reading), and comes back on scroll-up or
 * once scrolling stops. Callers own the actual transition classes and should
 * skip the animation under `prefers-reduced-motion` (e.g. Tailwind's
 * `motion-reduce:transition-none`) — this hook only ever reports a boolean.
 */
export function useHideOnScroll({
  revealDelayMs = 900,
  idleDelayMs = 500,
  hideThresholdPx = 6,
  armAfterPx = 64,
  narrowBreakpointPx = 640,
  narrowSafeScrollPx = 140,
}: {
  revealDelayMs?: number;
  idleDelayMs?: number;
  hideThresholdPx?: number;
  armAfterPx?: number;
  /** Below this viewport width, `narrowSafeScrollPx` applies (see below). No
   *  page's hero reaches this stack at or above it (checked at 1440px on the
   *  live site), so wider viewports keep the original, unconditional
   *  behavior untouched. */
  narrowBreakpointPx?: number;
  /** On a narrow viewport, every reveal path below (the initial timer,
   *  scroll-up, idle-settle) is forced hidden while `window.scrollY` is at
   *  or under this — a full-bleed mobile hero can fill almost the entire
   *  first screen, right up to where this fixed stack sits, so revealing on
   *  a timer (or the instant a visitor scrolls back up to the very top)
   *  settles it on top of that hero's own copy. `armAfterPx` isn't reused
   *  here on purpose: it's tuned for arming the hide-while-scrolling-down
   *  behavior a few px into any scroll, not for a hero's height. */
  narrowSafeScrollPx?: number;
} = {}) {
  const [visible, setVisible] = useState(false);
  const lastY = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lastY.current = window.scrollY;

    const isNearTop = () =>
      window.innerWidth < narrowBreakpointPx && window.scrollY <= narrowSafeScrollPx;
    const apply = (next: boolean) => setVisible(next && !isNearTop());

    const revealTimer = setTimeout(() => apply(true), revealDelayMs);

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) > hideThresholdPx) {
        apply(!(delta > 0 && y > armAfterPx));
        lastY.current = y;
      }
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => apply(true), idleDelayMs);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(revealTimer);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, [revealDelayMs, idleDelayMs, hideThresholdPx, armAfterPx, narrowBreakpointPx, narrowSafeScrollPx]);

  return visible;
}
