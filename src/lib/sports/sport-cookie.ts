import "server-only";

import { cookies } from "next/headers";
import { DEFAULT_SPORT, isSport } from "./registry";
import type { Sport } from "./types";

export const SPORT_COOKIE = "tmb_sport";

// Reads the active sport from the cookie. Absent / malformed ⇒ DEFAULT_SPORT
// (football). `cookies()` is async in Next 16 and must be awaited.
export async function activeSport(): Promise<Sport> {
  const store = await cookies();
  const raw = store.get(SPORT_COOKIE)?.value;
  return isSport(raw) ? raw : DEFAULT_SPORT;
}
