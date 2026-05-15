// Project canonical "today" = America/Los_Angeles. NBA games are played on US
// time and PT midnight is the latest the slate closes, so anchoring to LA
// keeps "today" stable across the whole league for the entire game window.
export const PROJECT_TIMEZONE = "America/Los_Angeles";

export function todayIsoDate(): string {
  // en-CA gives YYYY-MM-DD already; no string surgery needed.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PROJECT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isoDateOffset(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function isValidIsoDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
