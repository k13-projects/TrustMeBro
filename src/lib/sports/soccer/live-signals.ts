import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isoDateOffset, todayIsoDate } from "@/lib/date";
import {
  COMPETITION_ORDER,
  DEFAULT_COMPETITION,
  liveCompetitions,
  type SoccerCompetition,
} from "./competitions";

export type CompetitionLiveSignal = {
  /** Has a match with state 'in' right now. */
  inPlay: boolean;
  /** Has a match (not yet finished) kicking off today, PROJECT_TIMEZONE day. */
  today: boolean;
};

type Signals = {
  byCompetition: Map<SoccerCompetition, CompetitionLiveSignal>;
  /** The live competition with a match in play now, else the one with the
   *  nearest upcoming kickoff, else DEFAULT_COMPETITION. This is "nearest
   *  action" — what a no-cookie visitor should land on. */
  defaultCompetition: SoccerCompetition;
};

function emptySignal(): CompetitionLiveSignal {
  return { inPlay: false, today: false };
}

function fallback(): Signals {
  return {
    byCompetition: new Map(liveCompetitions().map((id) => [id, emptySignal()])),
    defaultCompetition: DEFAULT_COMPETITION,
  };
}

/**
 * One row per live competition — in-play now / kicking off today — plus the
 * competition a no-cookie visitor should default to. Backs both the
 * CompetitionBar's live dots and the football layout's default-competition
 * pick, so it's `cache()`'d: every caller on a request shares the one query
 * instead of each re-hitting soccer_matches. A window of yesterday..+8 days
 * (not just "today") catches a match still `in` past LA midnight and gives
 * the default-competition fallback a real nearest-kickoff to reach for.
 * Falls back to DEFAULT_COMPETITION / all-false on any error or empty
 * result — never blocks a page render.
 */
export const getLiveCompetitionSignals = cache(async (): Promise<Signals> => {
  const live = liveCompetitions();
  if (live.length === 0) return fallback();

  try {
    const supabase = await createSupabaseServerClient();
    const today = todayIsoDate();
    const from = isoDateOffset(today, -1);
    const to = isoDateOffset(today, 8);
    const { data, error } = await supabase
      .from("soccer_matches")
      .select("competition, state, date, datetime")
      .in("competition", live)
      .gte("date", from)
      .lte("date", to)
      .order("datetime", { ascending: true });

    if (error || !data || data.length === 0) return fallback();

    const byCompetition = new Map<SoccerCompetition, CompetitionLiveSignal>(
      live.map((id) => [id, emptySignal()]),
    );
    const nowMs = Date.now();
    let nearestUpcoming: { competition: SoccerCompetition; atMs: number } | null = null;
    let inPlayCompetition: SoccerCompetition | null = null;

    for (const row of data as Array<{
      competition: string;
      state: string;
      date: string;
      datetime: string | null;
    }>) {
      const competition = row.competition as SoccerCompetition;
      const signal = byCompetition.get(competition);
      if (!signal) continue; // defensive — row for a competition outside `live`

      if (row.state === "in") {
        signal.inPlay = true;
        if (!inPlayCompetition) inPlayCompetition = competition;
      }
      if (row.date === today && row.state !== "post") {
        signal.today = true;
      }
      if (row.state === "pre" && row.datetime) {
        const atMs = new Date(row.datetime).getTime();
        if (atMs >= nowMs && (!nearestUpcoming || atMs < nearestUpcoming.atMs)) {
          nearestUpcoming = { competition, atMs };
        }
      }
    }

    // Nearest action wins: a match in play right now beats an upcoming
    // kickoff. Multiple competitions live in play at once is rare enough
    // (never for UEFA's staggered kickoffs) that COMPETITION_ORDER breaks
    // the tie deterministically rather than depending on row order.
    const defaultCompetition =
      (inPlayCompetition &&
        COMPETITION_ORDER.find((id) => byCompetition.get(id)?.inPlay)) ||
      nearestUpcoming?.competition ||
      DEFAULT_COMPETITION;

    return { byCompetition, defaultCompetition };
  } catch {
    return fallback();
  }
});
