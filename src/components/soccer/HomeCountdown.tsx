"use client";

import { useEffect, useState } from "react";

// Ticking countdown to the next matchday. The server renders the label it
// computed, so first paint is correct and there is no hydration mismatch;
// the client then refines it on mount and keeps it current every minute.
export function HomeCountdown({
  target,
  initialLabel,
}: {
  target: string;
  initialLabel: string;
}) {
  const [label, setLabel] = useState(initialLabel);

  useEffect(() => {
    const compute = () => {
      const ms = new Date(target).getTime() - Date.now();
      if (!Number.isFinite(ms)) return;
      if (ms <= 0) {
        setLabel("Kicking off");
        return;
      }
      const minutes = Math.floor(ms / 60_000);
      const days = Math.floor(minutes / (60 * 24));
      const hours = Math.floor((minutes % (60 * 24)) / 60);
      const mins = minutes % 60;
      if (days >= 2) setLabel(`in ${days} days`);
      else if (days === 1) setLabel(`in 1 day ${hours}h`);
      else if (hours >= 1) setLabel(`in ${hours}h ${mins}m`);
      else setLabel(`in ${mins} min`);
    };
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {label}
    </span>
  );
}
