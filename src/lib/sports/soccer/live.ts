import "server-only";

import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { COMPETITIONS, type SoccerCompetition } from "./competitions";
import { soccerProviders } from "./espn";
import { insertStandings, upsertMatches } from "./repo";

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
// Only the main-phase feed: qualifying is over by the time anyone polls live.
export async function fetchLiveScores(
  competition: SoccerCompetition,
): Promise<LiveScore[]> {
  const [main] = soccerProviders(competition);
  const matches = await main.listMatches({ dates: [todayIsoDate()] });
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
// Archived competitions never refresh — their record is frozen.
export async function refreshFixturesWindow(
  competition: SoccerCompetition,
): Promise<number> {
  if (COMPETITIONS[competition].status !== "live") return 0;
  const today = todayIsoDate();
  const dates = [isoDateOffset(today, -1), today, isoDateOffset(today, 1)];
  const [main] = soccerProviders(competition);
  const matches = await main.listMatches({ dates });
  await upsertMatches(matches);
  return matches.length;
}

// Full sync for a competition over a date range: every feed (main + qualifying)
// plus a standings snapshot. Used by the daily cron and the one-time backfill.
export async function syncCompetition(opts: {
  competition: SoccerCompetition;
  from: string;
  to: string;
  standings?: boolean;
}): Promise<{ matches: number; standings: number; feeds: string[] }> {
  const meta = COMPETITIONS[opts.competition];
  let matchCount = 0;
  const feeds: string[] = [];
  for (const provider of soccerProviders(opts.competition)) {
    const matches = await provider.listMatchesInRange(opts.from, opts.to);
    await upsertMatches(matches);
    matchCount += matches.length;
    feeds.push(`${provider.slug}:${matches.length}`);
  }

  let standingsCount = 0;
  if (opts.standings !== false) {
    try {
      const [main] = soccerProviders(opts.competition);
      const standings = await main.listStandings(meta.season);
      await insertStandings(opts.competition, standings);
      standingsCount = standings.length;
    } catch {
      // Standings can be unavailable before a phase starts; fixtures still sync.
    }
  }
  return { matches: matchCount, standings: standingsCount, feeds };
}
