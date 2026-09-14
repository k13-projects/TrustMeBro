import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { COMPETITIONS, type SoccerCompetition } from "./competitions";
import { recordFailure, recordSuccess } from "./provider-health";
import { resolveMatch } from "./team-match";
import { fetchUefaSeason } from "./uefa";

// Last resort when both scoreboard hosts refuse us. ESPN's core API sits on
// different infrastructure and honours dates, but it hands back reference
// links rather than a assembled payload, so it is too chatty to serve pages.
// It is exactly right for the one job that cannot wait, though: closing out
// matches that have finished, so picks grade instead of hanging for days —
// which is what actually went wrong in the September outage.

const CORE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 TrustMeBro/0.1",
  Accept: "application/json, text/plain, */*",
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url.replace(/^http:/, "https:"), {
    headers: HEADERS,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`core api ${res.status} on ${url.slice(0, 80)}`);
  return res.json() as Promise<T>;
}

export type RecoveredState = {
  matchId: number;
  homeScore: number;
  awayScore: number;
  status: string;
  state: "pre" | "in" | "post";
  clock: string | null;
  period: number;
  finished: boolean;
  winnerTeamId: number | null;
};

async function recoverOne(
  slug: string,
  matchId: number,
): Promise<RecoveredState | null> {
  type Ref = { $ref: string };
  type Comp = {
    competitors?: Array<{
      id?: string;
      homeAway?: string;
      winner?: boolean;
      score?: Ref;
      team?: Ref;
    }>;
    status?: Ref;
  };
  const comp = await getJson<Comp>(
    `${CORE}/${slug}/events/${matchId}/competitions/${matchId}`,
  );
  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  if (!home || !away || !comp.status) return null;

  type Status = {
    displayClock?: string;
    period?: number;
    type?: { description?: string; state?: string; completed?: boolean };
  };
  type Score = { value?: number; displayValue?: string };
  const [status, homeScore, awayScore] = await Promise.all([
    getJson<Status>(comp.status.$ref),
    home.score ? getJson<Score>(home.score.$ref) : Promise.resolve({} as Score),
    away.score ? getJson<Score>(away.score.$ref) : Promise.resolve({} as Score),
  ]);

  const num = (s: Score) => Number(s.value ?? s.displayValue ?? 0) || 0;
  const winner = home.winner ? home.id : away.winner ? away.id : null;

  return {
    matchId,
    homeScore: num(homeScore),
    awayScore: num(awayScore),
    status: status.type?.description ?? "",
    state: (status.type?.state as RecoveredState["state"]) ?? "pre",
    clock: status.displayClock ?? null,
    period: status.period ?? 0,
    finished: status.type?.completed ?? false,
    winnerTeamId: winner ? Number(winner) : null,
  };
}

type StaleRow = {
  id: number;
  league_slug: string;
  date: string;
  home_team_id: number;
  away_team_id: number;
  home: { id: number; name: string } | { id: number; name: string }[] | null;
  away: { id: number; name: string } | { id: number; name: string }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

/**
 * Brings matches that should have finished up to date, and writes the result
 * to the rows we already hold. Tries UEFA first — one request covers a whole
 * season and it shares no infrastructure with ESPN — then falls through to
 * ESPN's core feed for anything still unresolved.
 */
export async function recoverFinishedMatches(
  competition: SoccerCompetition,
  limit = 20,
): Promise<{ checked: number; updated: number; viaUefa: number; viaCore: number }> {
  const supabase = supabaseAdmin();
  const cutoff = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("soccer_matches")
    .select(
      "id, league_slug, date, home_team_id, away_team_id, " +
        "home:soccer_teams!soccer_matches_home_team_id_fkey(id, name), " +
        "away:soccer_teams!soccer_matches_away_team_id_fkey(id, name)",
    )
    .eq("competition", competition)
    .eq("finished", false)
    .lt("datetime", cutoff)
    .order("datetime", { ascending: false })
    .limit(limit);
  const stale = (data ?? []) as unknown as StaleRow[];
  if (stale.length === 0) {
    return { checked: 0, updated: 0, viaUefa: 0, viaCore: 0 };
  }

  const now = new Date().toISOString();
  const resolved = new Set<number>();
  let viaUefa = 0;

  try {
    const season = await fetchUefaSeason(competition);
    if (season.length > 0) {
      await recordSuccess("uefa");
      const candidates = stale.map((row) => ({
        match: row,
        home: one(row.home)?.name ?? "",
        away: one(row.away)?.name ?? "",
      }));
      for (const u of season) {
        if (!u.finished || u.homeScore === null || u.awayScore === null) continue;
        const sameDay = candidates.filter(
          (c) => !resolved.has(c.match.id) && c.match.date === u.date,
        );
        if (sameDay.length === 0) continue;
        const hit = resolveMatch({ home_team: u.home, away_team: u.away }, sameDay);
        if (!hit) continue;

        const winner =
          u.homeScore > u.awayScore
            ? hit.home_team_id
            : u.awayScore > u.homeScore
              ? hit.away_team_id
              : u.shootoutWinner === u.home
                ? hit.home_team_id
                : u.shootoutWinner === u.away
                  ? hit.away_team_id
                  : null;

        await supabase
          .from("soccer_matches")
          .update({
            home_score: u.homeScore,
            away_score: u.awayScore,
            status: u.shootoutWinner ? "Final Score - After Penalties" : "Full Time",
            state: "post",
            finished: true,
            winner_team_id: winner,
            updated_at: now,
          })
          .eq("id", hit.id);
        resolved.add(hit.id);
        viaUefa += 1;
      }
    }
  } catch (err) {
    await recordFailure("uefa", err instanceof Error ? err.message : String(err));
  }

  const fallbackSlug = COMPETITIONS[competition].espnSlugs[0];
  let viaCore = 0;
  let coreOk = false;
  let lastError = "";
  for (const row of stale) {
    if (resolved.has(row.id)) continue;
    try {
      const state = await recoverOne(row.league_slug || fallbackSlug, row.id);
      if (!state) continue;
      coreOk = true;
      if (!state.finished) continue;
      await supabase
        .from("soccer_matches")
        .update({
          home_score: state.homeScore,
          away_score: state.awayScore,
          status: state.status,
          state: state.state,
          clock: state.clock,
          period: state.period,
          finished: true,
          winner_team_id: state.winnerTeamId,
          updated_at: now,
        })
        .eq("id", row.id);
      viaCore += 1;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  if (coreOk) await recordSuccess("espn-core");
  else if (lastError && viaUefa === 0) await recordFailure("espn-core", lastError);

  return { checked: stale.length, updated: viaUefa + viaCore, viaUefa, viaCore };
}
