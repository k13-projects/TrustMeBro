import "server-only";

import { cookies } from "next/headers";
import {
  COMPETITION_COOKIE,
  DEFAULT_COMPETITION,
  isCompetition,
  type SoccerCompetition,
} from "./competitions";

// Reads the football competition the visitor is browsing. Absent / malformed ⇒
// DEFAULT_COMPETITION (the live one). The switcher writes the cookie
// client-side and reloads, same pattern as the sport toggle.
export async function activeCompetition(): Promise<SoccerCompetition> {
  const store = await cookies();
  const raw = store.get(COMPETITION_COOKIE)?.value;
  return isCompetition(raw) ? raw : DEFAULT_COMPETITION;
}
