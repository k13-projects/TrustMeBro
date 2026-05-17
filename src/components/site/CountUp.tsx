"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "motion/react";

type Props = {
  to: number;
  from?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

export function CountUp({
  to,
  from = 0,
  duration = 1.4,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  // Trigger as soon as any pixel is visible, plus a safety mount-timer that
  // forces the count even if IntersectionObserver never fires (Playwright
  // full-page capture, prerendered server snapshots, etc.).
  const inView = useInView(ref, { once: true, amount: 0 });
  const [armed, setArmed] = useState(false);
  const [value, setValue] = useState(from);

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!inView && !armed) return;
    const controls = animate(from, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setValue(latest),
    });
    return () => controls.stop();
  }, [inView, armed, from, to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
