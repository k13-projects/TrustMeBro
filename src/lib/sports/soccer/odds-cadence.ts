// Pure gate for whether `/api/cron/soccer/track-odds` should spend an Odds
// API call on a competition right now. No DB, no fetch — testable.
//
// See `OddsCadence` in competitions.ts for the two knobs. A `null` cadence
// (every UEFA competition today) means "always eligible" — the caller's own
// "no unfinished match in the window" check is the only gate, unchanged.

import type { OddsCadence } from "./competitions";

const HOUR_MS = 3_600_000;

export function shouldPullOdds(
  cadence: OddsCadence,
  lastPulledAt: Date | null,
  earliestKickoff: Date | null,
  now: Date,
): boolean {
  if (!cadence) return true;
  if (!lastPulledAt) return true; // never pulled for this competition — take the first pull

  const hoursSincePull = (now.getTime() - lastPulledAt.getTime()) / HOUR_MS;
  if (hoursSincePull >= cadence.minHours) return true;

  // Only the final freshWithinHours before the next periodic slot can be
  // moved earlier. Outside that window, wait for the slot — this is what
  // caps the rate at 1 pull per minHours no matter how often matches recur.
  const hoursToNextSlot = cadence.minHours - hoursSincePull;
  if (hoursToNextSlot > cadence.freshWithinHours) return false;

  if (!earliestKickoff) return false;
  const hoursToKickoff = (earliestKickoff.getTime() - now.getTime()) / HOUR_MS;
  return hoursToKickoff >= 0 && hoursToKickoff <= cadence.freshWithinHours;
}
