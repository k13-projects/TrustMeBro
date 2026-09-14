import "server-only";

import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { COMPETITIONS, type SoccerCompetition } from "./competitions";
import { soccerProvider, soccerProviders } from "./espn";
import { insertStandings, upsertMatches } from "./repo";
import type { Match } from "./provider";

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

// Self-healing sweep: any match that kicked off more than three hours ago and
// is still not marked finished (a day the cron missed, a refresh that fired
// mid-match) is re-read one by one from ESPN's summary endpoint and upserted.
// Without this a match can sit at "Halftime" forever and its picks never grade.
export async function refreshStaleMatches(
  competition: SoccerCompetition,
  limit = 40,
): Promise<number> {
  const supabase = supabaseAdmin();
  const cutoff = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("soccer_matches")
    .select("id, league_slug, stage, grp, venue")
    .eq("competition", competition)
    .eq("finished", false)
    .lt("datetime", cutoff)
    .order("datetime", { ascending: false })
    .limit(limit);
  const stale = data ?? [];
  if (stale.length === 0) return 0;

  const refreshed: Match[] = [];
  await Promise.all(
    stale.map(async (row) => {
      const m = await soccerProvider(competition, row.league_slug).getMatch(row.id);
      if (!m) return;
      // The summary endpoint carries the score but not the round: its header
      // has no season slug, no competition note and no venue. Keep whatever
      // the scoreboard already told us rather than blanking the round, which
      // would strand the match outside its matchday.
      refreshed.push({
        ...m,
        stage: m.stage ?? row.stage,
        group: m.group ?? row.grp,
        venue: m.venue ?? row.venue,
      });
    }),
  );
  await upsertMatches(refreshed);
  return refreshed.length;
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

  await refreshStaleMatches(opts.competition);

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
