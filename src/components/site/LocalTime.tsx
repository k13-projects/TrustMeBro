"use client";

import { useSyncExternalStore } from "react";
import { effectiveTimeZone, formatInZone, type TimeFormat } from "@/lib/tz";

// The viewer's time zone is a browser-only fact, so the server renders the
// site-zone string it already computed and the client substitutes the local
// one. `useSyncExternalStore` is the right shape for "read an external value
// that differs between server and client": no state, no effect, no cascade.
// The zone cannot change without a reload, so the subscription is a no-op.
const subscribe = () => () => {};
const clientZone = () => effectiveTimeZone();
const serverZone = () => null;

export function LocalTime({
  iso,
  fallback,
  format = "kickoff",
  className,
}: {
  iso: string | null;
  fallback: string;
  format?: TimeFormat;
  className?: string;
}) {
  const zone = useSyncExternalStore(subscribe, clientZone, serverZone);

  if (!iso) return <span className={className}>{fallback}</span>;
  const text = zone ? formatInZone(iso, zone, format) : fallback;
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
