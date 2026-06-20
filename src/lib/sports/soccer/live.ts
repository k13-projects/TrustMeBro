import "server-only";

import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { soccerProvider } from "./espn";
import { upsertMatches } from "./repo";

// Minimal shape the live poller needs — just the volatile bits of a match.
export type LiveScore = {
  id: number;
  state: "pre" | "in" | "post";
  status: string;
  clock: string | null;
  home_score: number;
  away_score: number;
  finished: boolean;
};

// Fresh from ESPN (free, fast, ~30s edge-cached). Used by /api/soccer/live for
// the client poller — no DB round-trip so live scores stay current to the tick.
export async function fetchLiveScores(): Promise<LiveScore[]> {
  const matches = await soccerProvider().listMatches({ dates: [todayIsoDate()] });
  return matches.map((m) => ({
    id: m.id,
    state: m.state,
    status: m.status,
    clock: m.clock,
    home_score: m.home_score,
    away_score: m.away_score,
    finished: m.finished,
  }));
}

// Pull yesterday→tomorrow fixtures from ESPN and upsert into soccer_matches so
// the SSR pages (which read the DB) don't lag the daily sync cron. Called from
// an on-visit throttled refresh, so it only runs when someone's actually here.
export async function refreshFixturesWindow(): Promise<number> {
  const today = todayIsoDate();
  const dates = [isoDateOffset(today, -1), today, isoDateOffset(today, 1)];
  const matches = await soccerProvider().listMatches({ dates });
  await upsertMatches(matches);
  return matches.length;
}
