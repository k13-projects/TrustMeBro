import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { COMPETITIONS, type SoccerCompetition } from "./competitions";
import { recordFailure, recordSuccess } from "./provider-health";

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

/**
 * Brings matches that should have finished up to date using the backup feed,
 * and writes the result straight to the rows we already hold. Returns how
 * many it managed to close out.
 */
export async function recoverFinishedMatches(
  competition: SoccerCompetition,
  limit = 20,
): Promise<{ checked: number; updated: number }> {
  const supabase = supabaseAdmin();
  const cutoff = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("soccer_matches")
    .select("id, league_slug")
    .eq("competition", competition)
    .eq("finished", false)
    .lt("datetime", cutoff)
    .order("datetime", { ascending: false })
    .limit(limit);
  const stale = data ?? [];
  if (stale.length === 0) return { checked: 0, updated: 0 };

  const fallbackSlug = COMPETITIONS[competition].espnSlugs[0];
  let updated = 0;
  let anySuccess = false;
  let lastError = "";

  for (const row of stale) {
    try {
      const state = await recoverOne(row.league_slug || fallbackSlug, row.id);
      if (!state) continue;
      anySuccess = true;
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
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      updated += 1;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (anySuccess) await recordSuccess("espn-core");
  else if (lastError) await recordFailure("espn-core", lastError);

  return { checked: stale.length, updated };
}
