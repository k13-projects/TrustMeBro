import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// Small standalone reads for the match detail page. Kept out of queries.ts
// (owned concurrently by another change) even though they query the same
// table — one column each, cheap to keep separate.

// The ESPN league slug a match was ingested under. Qualifying ties live under
// a different slug than the main phase, and `soccerProvider(competition, slug)`
// needs it to fetch the right event from ESPN's match-summary endpoint.
export async function getMatchLeagueSlug(matchId: number): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("soccer_matches")
    .select("league_slug")
    .eq("id", matchId)
    .maybeSingle();
  return (data?.league_slug as string | undefined) ?? null;
}
