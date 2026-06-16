import type { Sport } from "./types";

// Football is the default sport while only the World Cup is live (the NBA
// season is over). The `tmb:sport` cookie persists the user's toggle choice;
// absent cookie ⇒ this default. See project_soccer_expansion.
export const DEFAULT_SPORT: Sport = "soccer";

// 1 year, in seconds — how long the sport choice persists in the cookie.
export const SPORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Client-safe metadata only (labels, routing, branding hints). Server-only
// provider resolution lives in each sport's module, not here, so this file is
// importable from client components (the toggle, the nav).
export type NavItem = { href: string; label: string; exact?: boolean };

export type SportMeta = {
  sport: Sport;
  label: string; // human nav label: "Basketball" / "Football"
  competition: string; // current competition: "NBA" / "World Cup"
  emoji: string; // 🏀 / ⚽
  /** Root section path for this sport. NBA is the legacy root; football is additive. */
  home: string;
  accent: string; // section accent hex (gold master-brand by default)
  nav: NavItem[]; // primary nav for this sport
};

export const SPORTS: Record<Sport, SportMeta> = {
  nba: {
    sport: "nba",
    label: "Basketball",
    competition: "NBA",
    emoji: "🏀",
    home: "/",
    accent: "#FFB800",
    nav: [
      { href: "/", label: "Home", exact: true },
      { href: "/#picks", label: "Picks" },
      { href: "/games", label: "Games" },
      { href: "/results", label: "Results" },
      { href: "/news", label: "News" },
      { href: "/teams", label: "Teams" },
      { href: "/bros", label: "Bro Board" },
      { href: "/scorecard", label: "Scorecard" },
      { href: "/history", label: "History" },
    ],
  },
  soccer: {
    sport: "soccer",
    label: "Football",
    competition: "World Cup",
    emoji: "⚽",
    home: "/football",
    accent: "#FFB800",
    nav: [
      { href: "/football", label: "Home", exact: true },
      { href: "/football/schedule", label: "Schedule" },
      { href: "/football/standings", label: "Standings" },
      { href: "/football/picks", label: "Picks" },
      { href: "/football/scoreboard", label: "Scoreboard" },
    ],
  },
};

export const SPORT_ORDER: Sport[] = ["soccer", "nba"];

export function isSport(value: unknown): value is Sport {
  return value === "nba" || value === "soccer";
}

export function sportMeta(sport: Sport): SportMeta {
  return SPORTS[sport];
}

// The Odds API sport keys + the ESPN soccer league slugs, keyed for the
// (future) multi-league soccer rollout. World Cup ships first.
export const SOCCER_LEAGUE_SLUG = "fifa.world";
export const SOCCER_ODDS_SPORT_KEY = "soccer_fifa_world_cup";
