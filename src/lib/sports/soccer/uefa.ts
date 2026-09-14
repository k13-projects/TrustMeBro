import "server-only";

import { isoDateInProjectTz } from "@/lib/date";
import { COMPETITIONS, type SoccerCompetition } from "./competitions";

// UEFA's own match feed — the body that runs these competitions, on its own
// infrastructure, with no key. It is the one source here that does not share
// a failure domain with ESPN, which is the whole point of having it: when
// ESPN refused us for three days in September, this would have kept results
// and settlement moving.
//
// It is a fallback, not a replacement: it carries results, kickoff times and
// matchdays, but none of the stats, lineups, commentary or crests the pages
// are built on, and it has nothing to say about the World Cup.

const BASE = "https://match.uefa.com/v5/matches";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 TrustMeBro/0.1",
  Accept: "application/json",
};

/** UEFA's own competition ids. The World Cup is FIFA's, so it has none. */
export const UEFA_COMPETITION_ID: Record<SoccerCompetition, number | null> = {
  "uefa.champions": 1,
  "uefa.europa": 14,
  "uefa.europa.conf": 2019,
  "fifa.world": null,
};

export type UefaMatch = {
  id: number;
  kickoff: string | null;
  /** Canonical LA day, so it lines up with how we key every other match. */
  date: string | null;
  status: string;
  finished: boolean;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Winner's name when a shoot-out decided it, otherwise null. */
  shootoutWinner: string | null;
  matchday: string | null;
};

type RawTeam = { internationalName?: string; displayName?: string };
type RawScoreSide = { home?: number; away?: number };
type RawMatch = {
  id?: number | string;
  status?: string;
  kickOffTime?: { dateTime?: string };
  homeTeam?: RawTeam;
  awayTeam?: RawTeam;
  score?: { total?: RawScoreSide; regular?: RawScoreSide; penalty?: RawScoreSide };
  matchday?: { name?: string };
};

function teamName(t: RawTeam | undefined): string {
  return t?.internationalName ?? t?.displayName ?? "";
}

function normalise(m: RawMatch): UefaMatch | null {
  const home = teamName(m.homeTeam);
  const away = teamName(m.awayTeam);
  if (!home || !away) return null;
  const kickoff = m.kickOffTime?.dateTime ?? null;
  const total = m.score?.total ?? m.score?.regular;
  const pen = m.score?.penalty;
  const shootoutWinner =
    pen && typeof pen.home === "number" && typeof pen.away === "number"
      ? pen.home > pen.away
        ? home
        : pen.away > pen.home
          ? away
          : null
      : null;
  return {
    id: Number(m.id),
    kickoff,
    date: kickoff ? isoDateInProjectTz(kickoff) : null,
    status: m.status ?? "",
    finished: m.status === "FINISHED",
    home,
    away,
    homeScore: typeof total?.home === "number" ? total.home : null,
    awayScore: typeof total?.away === "number" ? total.away : null,
    shootoutWinner,
    matchday: m.matchday?.name ?? null,
  };
}

/**
 * Every match UEFA holds for a competition's current season. One request
 * covers a whole season, which is why this is the first fallback reached for
 * rather than the per-match feeds.
 */
export async function fetchUefaSeason(
  competition: SoccerCompetition,
): Promise<UefaMatch[]> {
  const competitionId = UEFA_COMPETITION_ID[competition];
  if (competitionId === null) return [];
  // ESPN labels 2026-27 as season 2026; UEFA labels it by the closing year.
  const seasonYear = COMPETITIONS[competition].season + 1;

  const out: UefaMatch[] = [];
  const pageSize = 200;
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const url = `${BASE}?competitionId=${competitionId}&seasonYear=${seasonYear}&phase=ALL&offset=${offset}&limit=${pageSize}`;
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`uefa ${res.status} ${res.statusText} on ${competition}`);
    }
    const page = (await res.json()) as RawMatch[];
    if (!Array.isArray(page) || page.length === 0) break;
    for (const raw of page) {
      const m = normalise(raw);
      if (m) out.push(m);
    }
    if (page.length < pageSize) break;
  }
  return out;
}
