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
}: {
  revealDelayMs?: number;
  idleDelayMs?: number;
  hideThresholdPx?: number;
  armAfterPx?: number;
} = {}) {
  const [visible, setVisible] = useState(false);
  const lastY = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const revealTimer = setTimeout(() => setVisible(true), revealDelayMs);
    lastY.current = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) > hideThresholdPx) {
        setVisible(!(delta > 0 && y > armAfterPx));
        lastY.current = y;
      }
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setVisible(true), idleDelayMs);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(revealTimer);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, [revealDelayMs, idleDelayMs, hideThresholdPx, armAfterPx]);

  return visible;
}
