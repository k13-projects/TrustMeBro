import type { Sport } from "./types";

// Football is the default sport while the NBA is in its off-season (the
// Champions League is the live competition). The `tmb_sport` cookie persists
// the user's toggle choice; absent cookie ⇒ this default.
export const DEFAULT_SPORT: Sport = "soccer";

// 1 year, in seconds — how long the sport choice persists in the cookie.
export const SPORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Client-safe metadata only (labels, routing, branding hints). Server-only
// provider resolution lives in each sport's module, not here, so this file is
// importable from client components (the toggle, the nav).
export type NavItem = { href: string; label: string; exact?: boolean };

// A sport's primary nav is a short list of entries, where an entry is either a
// single link or a labelled group. Twelve flat links only fitted from 1536px,
// which hid the entire navigation behind a hamburger on an ordinary laptop;
// grouping gets the row back onto the screen without losing a destination.
export type NavGroup = { label: string; items: NavItem[] };
export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

/** Every destination, groups opened out — for the drawer and the bottom bar. */
export function flattenNav(entries: readonly NavEntry[]): NavItem[] {
  return entries.flatMap((e) => (isNavGroup(e) ? e.items : [e]));
}

export type SportMeta = {
  sport: Sport;
  label: string; // human nav label: "Basketball" / "Football"
  competition: string; // umbrella label: "NBA" / "Football" (football's live competition comes from ./soccer/competitions)
  emoji: string; // 🏀 / ⚽
  logo: string; // league logo (dark-variant, for the toggle/chrome)
  /** Root section path for this sport. NBA is the legacy root; football is additive. */
  home: string;
  accent: string; // section accent hex (gold master-brand by default)
  nav: NavEntry[]; // primary nav for this sport
};

export const SPORTS: Record<Sport, SportMeta> = {
  nba: {
    sport: "nba",
    label: "Basketball",
    competition: "NBA",
    emoji: "🏀",
    logo: "https://a.espncdn.com/i/teamlogos/leagues/500-dark/nba.png",
    home: "/",
    accent: "#FFB800",
    nav: [
      { href: "/", label: "Home", exact: true },
      {
        label: "Matches",
        items: [
          { href: "/games", label: "Games" },
          { href: "/results", label: "Results" },
          { href: "/teams", label: "Teams" },
        ],
      },
      {
        label: "Picks",
        items: [
          { href: "/#picks", label: "Today's Picks" },
          { href: "/scorecard", label: "Scorecard" },
        ],
      },
      {
        label: "Play",
        items: [
          { href: "/bros", label: "Bro Board" },
          { href: "/history", label: "History" },
        ],
      },
      { href: "/news", label: "News" },
    ],
  },
  soccer: {
    sport: "soccer",
    label: "Football",
    competition: "Football",
    emoji: "⚽",
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/2.png",
    home: "/football",
    accent: "#FFB800",
    nav: [
      { href: "/football", label: "Home", exact: true },
      {
        label: "Matches",
        items: [
          { href: "/football/schedule", label: "Schedule" },
          { href: "/football/standings", label: "Standings" },
          { href: "/football/bracket", label: "Bracket" },
          { href: "/football/clubs", label: "Clubs" },
        ],
      },
      {
        label: "Picks",
        items: [
          { href: "/football/picks", label: "Engine Picks" },
          { href: "/football/value", label: "Best Value" },
          { href: "/football/rates", label: "Odds" },
          { href: "/football/scoreboard", label: "Scoreboard" },
          { href: "/football/results", label: "Results" },
          { href: "/football/glossary", label: "How To Read" },
        ],
      },
      {
        label: "Play",
        items: [
          { href: "/football/predictions", label: "Predictions" },
          { href: "/bros", label: "Bro Board" },
          { href: "/history", label: "History" },
        ],
      },
      { href: "/football/news", label: "News" },
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

// Football competitions (World Cup archive, live Champions League) live in
// ./soccer/competitions.ts — ESPN slugs, Odds API keys, logos, status.
