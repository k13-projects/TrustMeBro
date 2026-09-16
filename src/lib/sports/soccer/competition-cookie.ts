import "server-only";

import { cookies } from "next/headers";
import { COMPETITION_COOKIE, isCompetition, type SoccerCompetition } from "./competitions";
import { getLiveCompetitionSignals } from "./live-signals";

// Reads the football competition the visitor is browsing. A set cookie
// always wins (the switcher writes it client-side and reloads, same pattern
// as the sport toggle). Absent / malformed ⇒ the nearest action: whichever
// live competition has a match in play right now, else the one with the
// nearest upcoming kickoff, else DEFAULT_COMPETITION — see
// `getLiveCompetitionSignals`. That query is `cache()`'d, so picking the
// default here costs nothing extra on top of what the layout/CompetitionBar
// already ask for on the same request.
export async function activeCompetition(): Promise<SoccerCompetition> {
  const store = await cookies();
  const raw = store.get(COMPETITION_COOKIE)?.value;
  if (isCompetition(raw)) return raw;
  const { defaultCompetition } = await getLiveCompetitionSignals();
  return defaultCompetition;
}
