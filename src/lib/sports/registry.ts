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

/**
 * The width at which a sport's desktop link row actually fits, and below which
 * the hamburger carries navigation instead. Every nav surface reads the same
 * tier so the handoff happens at one breakpoint with no dead zone.
 *
 * This used to be inferred from how many entries a nav had
 * (`navItems.length > 6`), which was wrong twice: the file carried two stale
 * comments contradicting each other *and* the code, and adding a sixth
 * football group silently overflowed 1024px by 24px, clipping the sign-in
 * button. **A count is not a width.** Numbers below are measured with
 * `scrollWidth` vs `clientWidth` at real viewports, and re-measured whenever a
 * top-level label changes — which is the only thing that moves the row.
 */
export type NavTier = "lg" | "wide" | "xl";

/** Tailwind needs these spelled out literally; never build them by hand. */
export const NAV_TIER = {
  lg: { row: "hidden lg:flex", inline: "hidden lg:inline-flex", below: "lg:hidden" },
  wide: {
    row: "hidden min-[1100px]:flex",
    inline: "hidden min-[1100px]:inline-flex",
    below: "min-[1100px]:hidden",
  },
  xl: { row: "hidden xl:flex", inline: "hidden xl:inline-flex", below: "xl:hidden" },
} as const satisfies Record<NavTier, { row: string; inline: string; below: string }>;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

/** Every destination, groups opened out — for the drawer and the bottom bar. */
export function flattenNav(entries: readonly NavEntry[]): NavItem[] {
  return entries.flatMap((e) => (isNavGroup(e) ? e.items : [e]));
}

/**
 * A sport's nav with destinations the active competition has nothing to show
 * removed. Right now that is Bracket: the Süper Lig is eighteen clubs and one
 * table, so a Bracket link there opens an empty page — a dead end dressed up
 * as a feature, and the exact thing that makes a nav feel untrustworthy. The
 * UEFA competitions and the World Cup archive all keep it.
 *
 * Drops a group that ends up empty rather than leaving a menu that opens onto
 * nothing.
 */
export function navForSport(
  sport: Sport,
  opts: { hasBracket?: boolean } = {},
): NavEntry[] {
  const nav = SPORTS[sport].nav;
  if (opts.hasBracket !== false) return nav;
  return nav
    .map((entry) =>
      isNavGroup(entry)
        ? {
            ...entry,
            items: entry.items.filter((i) => i.href !== "/football/bracket"),
          }
        : entry,
    )
    .filter((entry) => !isNavGroup(entry) || entry.items.length > 0);
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
  /** Measured width at which this sport's link row fits — see NAV_TIER. */
  navTier: NavTier;
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
    // 5 short entries; unchanged by the 2026-09-16 football restructure.
    navTier: "lg",
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
    // 6 entries since Record was split out of Picks. Measured 2026-09-16:
    // overflows 1024 by 24px (sign-in button clipped), clears 1152 by 24px.
    // "wide" (1100) sits just past the crossover, with the nav-link padding
    // trim below buying the margin.
    navTier: "wide",
    nav: [
      { href: "/football", label: "Home", exact: true },
      // Football words mean something already, and the nav used to fight
      // that. "Results" and "Scoreboard" both sat under Picks while meaning
      // *our graded picks*, so anyone hunting for match scores opened the
      // wrong menu, found a page called Results, and got a bet ledger. Every
      // label below now matches the heading of the page it opens, and
      // anything that reads as a match word is kept out of the betting menus.
      {
        label: "Matches",
        items: [
          { href: "/football/schedule", label: "Schedule" },
          // Page reads "League Table", and that is the term on every
          // scoreboard in the sport. "Standings" only matched the US one.
          { href: "/football/standings", label: "League Table" },
          { href: "/football/bracket", label: "Bracket" },
          { href: "/football/clubs", label: "Clubs" },
        ],
      },
      // Picks is what we think you should back — forward-looking only.
      {
        label: "Picks",
        items: [
          { href: "/football/picks", label: "Engine Picks" },
          { href: "/football/value", label: "Best Value" },
          { href: "/football/rates", label: "Match Odds" },
        ],
      },
      // Record is how those calls actually went — the site's whole claim, and
      // previously buried three items deep inside Picks. "How to Read" lives
      // here because what needs explaining is the scoring: +1.0 a win, -1.0 a
      // loss, and what banko and value mean.
      {
        label: "Record",
        items: [
          { href: "/football/scoreboard", label: "Engine Scoreboard" },
          { href: "/football/results", label: "Settled Picks" },
          { href: "/football/glossary", label: "How to Read" },
        ],
      },
      // Play is what *you* do, so every label is in the first person or names
      // the game itself. "Predictions" had to go: it was the user's
      // score-guessing game wearing the engine's word.
      {
        label: "Play",
        items: [
          { href: "/football/predictions", label: "Call the Scores" },
          { href: "/bros", label: "Bro Board" },
          { href: "/history", label: "My Bets" },
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
