// Project canonical "today" = America/Los_Angeles. NBA games are played on US
// time and PT midnight is the latest the slate closes, so anchoring to LA
// keeps "today" stable across the whole league for the entire game window.
export const PROJECT_TIMEZONE = "America/Los_Angeles";

const PROJECT_TZ_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: PROJECT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayIsoDate(): string {
  // en-CA gives YYYY-MM-DD already; no string surgery needed.
  return PROJECT_TZ_FORMATTER.format(new Date());
}

// Project-canonical date for any moment. NBA "game date" must be LA-anchored,
// not UTC: a 7pm PT tip-off is 02:00 UTC the next day, so naive .slice(0,10) on
// the UTC ISO would mis-bucket late games to tomorrow.
export function isoDateInProjectTz(iso: string): string {
  return PROJECT_TZ_FORMATTER.format(new Date(iso));
}

export function isoDateOffset(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function isValidIsoDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
