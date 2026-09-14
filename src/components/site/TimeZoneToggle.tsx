"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "lucide-react";
import {
  detectTimeZone,
  readTimeZonePreference,
  SITE_TIMEZONE,
  writeTimeZonePreference,
  zoneLabel,
} from "@/lib/tz";
import { cx, focusRing } from "@/lib/design/tokens";

// Says which zone kickoff times are shown in, and lets the viewer pin the
// site's own zone instead of their local one. Reloading on change keeps every
// rendered time in agreement rather than leaving half the page in each zone.
const subscribe = () => () => {};
const clientBrowserZone = () => detectTimeZone();
const clientPinned = () => readTimeZonePreference();
const serverNull = () => null;

export function TimeZoneToggle() {
  const browserZone = useSyncExternalStore(subscribe, clientBrowserZone, serverNull);
  const pinned = useSyncExternalStore(subscribe, clientPinned, serverNull);

  if (!browserZone) {
    return (
      <span className="text-xs text-muted-foreground">
        Times shown in your local zone
      </span>
    );
  }

  const usingSite = pinned === SITE_TIMEZONE;
  const active = pinned ?? browserZone;
  const sameZone = browserZone === SITE_TIMEZONE;

  function choose(zone: string | null) {
    writeTimeZonePreference(zone);
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Clock size={13} aria-hidden className="shrink-0" />
      <span>
        Times in <span className="text-foreground/80">{zoneLabel(active)}</span>
      </span>
      {sameZone ? null : (
        <span className="inline-flex overflow-hidden rounded-full border border-border/70">
          <button
            type="button"
            onClick={() => choose(null)}
            aria-pressed={!usingSite}
            className={cx(
              "px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
              !usingSite
                ? "bg-primary text-primary-foreground"
                : "text-foreground/60 hover:text-foreground",
              focusRing,
            )}
          >
            Yours
          </button>
          <button
            type="button"
            onClick={() => choose(SITE_TIMEZONE)}
            aria-pressed={usingSite}
            className={cx(
              "px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
              usingSite
                ? "bg-primary text-primary-foreground"
                : "text-foreground/60 hover:text-foreground",
              focusRing,
            )}
          >
            {zoneLabel(SITE_TIMEZONE)}
          </button>
        </span>
      )}
    </div>
  );
}
