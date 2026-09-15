import { PROJECT_TIMEZONE } from "./date";

// Kickoff times are stored as instants and were displayed only in the
// project's canonical zone (America/Los_Angeles), so a viewer in Istanbul
// read "9:45 AM" for a match that starts at 19:45 their evening.
//
// Important: America/Los_Angeles remains the canonical DAY boundary for the
// whole system — `todayIsoDate()`, cron windows, the `date` column, grouping
// keys. Nothing here touches that. This module is only about the clock time
// a human reads.

export const TZ_COOKIE = "tmb_tz";
export const TZ_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The site's own zone, offered as an explicit alternative to the viewer's. */
export const SITE_TIMEZONE = PROJECT_TIMEZONE;

export type TimeFormat = "kickoff" | "time" | "date" | "dayTime" | "full";

const OPTIONS: Record<TimeFormat, Intl.DateTimeFormatOptions> = {
  // Just the clock, for a banner that already says which day it is.
  kickoff: { hour: "numeric", minute: "2-digit" },
  time: { hour: "numeric", minute: "2-digit" },
  // Just the day, no clock — a settled-history row cares which day a match
  // was played, not what time it kicked off.
  date: { month: "short", day: "numeric" },
  dayTime: {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  full: {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
};

export function formatInZone(
  iso: string | null,
  timeZone: string,
  format: TimeFormat = "kickoff",
): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "TBD";
  try {
    return d.toLocaleString("en-US", { ...OPTIONS[format], timeZone });
  } catch {
    return d.toLocaleString("en-US", { ...OPTIONS[format], timeZone: SITE_TIMEZONE });
  }
}

/** "Europe/Istanbul" → "Istanbul". Good enough for a one-line label. */
export function zoneLabel(timeZone: string): string {
  const tail = timeZone.split("/").pop() ?? timeZone;
  return tail.replace(/_/g, " ");
}

/** The browser's own zone, or the site zone when it can't be determined. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || SITE_TIMEZONE;
  } catch {
    return SITE_TIMEZONE;
  }
}

/** An explicit preference set through the footer toggle, if any. */
export function readTimeZonePreference(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${TZ_COOKIE}=`));
  if (!hit) return null;
  const value = decodeURIComponent(hit.slice(TZ_COOKIE.length + 1));
  return value ? value : null;
}

export function writeTimeZonePreference(timeZone: string | null): void {
  if (typeof document === "undefined") return;
  document.cookie = timeZone
    ? `${TZ_COOKIE}=${encodeURIComponent(timeZone)}; path=/; max-age=${TZ_COOKIE_MAX_AGE}; samesite=lax`
    : `${TZ_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Preference first, then the browser, then the site's own zone. */
export function effectiveTimeZone(): string {
  return readTimeZonePreference() ?? detectTimeZone();
}
