"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SPORTS, SPORT_COOKIE_MAX_AGE } from "./registry";
import { SPORT_COOKIE } from "./sport-cookie";
import type { Sport } from "./types";

// The global sport switch. Persists the choice in the cookie SSR reads, then
// lands on that sport's home. One switch scopes sections, scoreboard, coupons.
export async function setSport(sport: Sport): Promise<void> {
  const store = await cookies();
  store.set(SPORT_COOKIE, sport, {
    path: "/",
    maxAge: SPORT_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  redirect(SPORTS[sport].home);
}
