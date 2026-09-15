// Football competitions. Client-safe (labels, routing, branding) — no server
// imports, so the competition switcher and headers can read it.
//
// Ids are ESPN league slugs. Every soccer table carries a `competition` column
// (migration 0022) so each tournament keeps its own fixtures, standings, picks
// and ledger. Archived competitions stay fully browsable via the switcher but
// no cron pulls for them — the World Cup 2026 record is frozen exactly as it
// finished, and can be brought back live by flipping `status`.

export type SoccerCompetition =
  | "fifa.world"
  | "uefa.champions"
  | "uefa.europa"
  | "uefa.europa.conf"
  | "tur.1";

export const COMPETITION_COOKIE = "tmb_competition";
export const COMPETITION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type CompetitionTheme = "wc" | "ucl" | "uel" | "uecl" | "sl";

/**
 * Throttle for `/api/cron/soccer/track-odds`. `null` keeps the original,
 * unbounded behavior (pull whenever the lookahead window has an unfinished
 * match) — correct for UEFA's competitions, whose matchdays cluster every
 * few weeks so most days already cost nothing. A weekly domestic league
 * satisfies "an unfinished match in the window" on almost every day, so it
 * needs an actual rate limit:
 *
 * - `minHours` is a hard floor — a pull never happens sooner than this many
 *   hours after the previous one, full stop. This is what bounds monthly
 *   credit spend (30.4 days × 24h / minHours pulls/month × 4 credits/pull).
 * - `freshWithinHours` lets a pull move *earlier* than its next `minHours`
 *   slot — but only up to `freshWithinHours` early — when doing so would
 *   otherwise mean the nearest unfinished match kicks off before the next
 *   slot arrives. It never adds an extra pull; it only re-times the existing
 *   one so the price isn't stale by kickoff. See `odds-cadence.ts`.
 */
export type OddsCadence = { minHours: number; freshWithinHours: number } | null;

export type CompetitionMeta = {
  id: SoccerCompetition;
  label: string; // "Champions League"
  fullName: string; // "UEFA Champions League"
  shortLabel: string; // "UCL"
  season: number; // ESPN season year
  seasonLabel: string; // "2026-27"
  status: "live" | "archived";
  kind: "national" | "club";
  /** ESPN league slugs that feed this competition. First = main phase. */
  espnSlugs: string[];
  /** The Odds API sport key for the main phase, or null with no odds source yet
   *  (skip guards in track-odds/generate-predictions gate on this). */
  oddsKey: string | null;
  /** Odds-pull rate limit — see `OddsCadence`. Null for every UEFA
   *  competition (unthrottled, unchanged) and for any competition with
   *  `oddsKey: null` (irrelevant — never pulled at all). */
  oddsCadence: OddsCadence;
  /** ESPN league logo (light-on-dark variant) — used as emblem + toggle knob. */
  logo: string;
  emoji: string;
  theme: CompetitionTheme;
  /** Headline eyebrow on the section home. */
  tagline: string;
  /** Name for the current phase as a human label (headers, chat). */
  phaseLabel: string;
  /** True only for UEFA's 36-team league phase, where a single table above
   *  8 rows carries real Round of 16 / play-off / out qualification zones.
   *  A domestic single-table league (Süper Lig) also renders as one table
   *  above 8 rows but has no such zones — this flag keeps the zone legend,
   *  the "Round of 16 places" heading, and the hardcoded "36-team" copy from
   *  bleeding onto a competition where they'd describe something that isn't
   *  real. */
  qualificationZones: boolean;
};

export const COMPETITIONS: Record<SoccerCompetition, CompetitionMeta> = {
  "uefa.champions": {
    id: "uefa.champions",
    label: "Champions League",
    fullName: "UEFA Champions League",
    shortLabel: "UCL",
    season: 2026,
    seasonLabel: "2026-27",
    status: "live",
    kind: "club",
    espnSlugs: ["uefa.champions", "uefa.champions_qual"],
    oddsKey: "soccer_uefa_champs_league",
    oddsCadence: null,
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/2.png",
    emoji: "⭐",
    theme: "ucl",
    tagline: "The best of Europe, every matchday",
    phaseLabel: "League Phase",
    qualificationZones: true,
  },
  "uefa.europa": {
    id: "uefa.europa",
    label: "Europa League",
    fullName: "UEFA Europa League",
    shortLabel: "UEL",
    season: 2026,
    seasonLabel: "2026-27",
    status: "live",
    kind: "club",
    espnSlugs: ["uefa.europa", "uefa.europa_qual"],
    oddsKey: "soccer_uefa_europa_league",
    oddsCadence: null,
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/2310.png",
    emoji: "🟠",
    theme: "uel",
    tagline: "Thursday nights, the long road to the final",
    phaseLabel: "League Phase",
    qualificationZones: true,
  },
  "uefa.europa.conf": {
    id: "uefa.europa.conf",
    label: "Conference League",
    fullName: "UEFA Conference League",
    shortLabel: "UECL",
    season: 2026,
    seasonLabel: "2026-27",
    status: "live",
    kind: "club",
    espnSlugs: ["uefa.europa.conf", "uefa.europa.conf_qual"],
    oddsKey: "soccer_uefa_europa_conference_league",
    oddsCadence: null,
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/20296.png",
    emoji: "🟢",
    theme: "uecl",
    tagline: "Europe's third tier, first-time finalists every year",
    phaseLabel: "League Phase",
    qualificationZones: true,
  },
  "fifa.world": {
    id: "fifa.world",
    label: "World Cup",
    fullName: "FIFA World Cup 2026",
    shortLabel: "WC",
    season: 2026,
    seasonLabel: "2026",
    status: "archived",
    kind: "national",
    espnSlugs: ["fifa.world"],
    oddsKey: "soccer_fifa_world_cup",
    oddsCadence: null,
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/4.png",
    emoji: "🏆",
    theme: "wc",
    tagline: "Tournament complete — the full record, preserved",
    phaseLabel: "Final",
    qualificationZones: false,
  },
  "tur.1": {
    id: "tur.1",
    label: "Süper Lig",
    fullName: "Turkish Süper Lig",
    shortLabel: "SL",
    season: 2026,
    seasonLabel: "2026-27",
    status: "live",
    kind: "club",
    espnSlugs: ["tur.1"],
    oddsKey: "soccer_turkey_super_league",
    // Süper Lig plays Fri-Mon nearly every week Aug-May, so the plain
    // "unfinished match in the lookahead window" gate (used by every UEFA
    // competition) would fire almost daily. Simulated a full 10-month season
    // of weekly Fri-Mon rounds against this cadence (no international
    // breaks, i.e. worst case): ~8.7 pulls/month = ~35 credits/month, under
    // the 40/month budget. See docs/handoffs/superlig-odds_2026-09-14.md.
    oddsCadence: { minHours: 78, freshWithinHours: 24 },
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/18.png",
    emoji: "🔴",
    theme: "sl",
    tagline: "18 clubs, one table, every Turkish derby",
    phaseLabel: "Regular Season",
    qualificationZones: false,
  },
};

export const COMPETITION_ORDER: SoccerCompetition[] = [
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf",
  "tur.1",
  "fifa.world",
];

// The competition a football visitor lands on with no cookie.
export const DEFAULT_COMPETITION: SoccerCompetition = "uefa.champions";

export function isCompetition(value: unknown): value is SoccerCompetition {
  return typeof value === "string" && value in COMPETITIONS;
}

export function competitionMeta(id: SoccerCompetition): CompetitionMeta {
  return COMPETITIONS[id];
}

export function liveCompetitions(): SoccerCompetition[] {
  return COMPETITION_ORDER.filter((id) => COMPETITIONS[id].status === "live");
}

// Human label for an ESPN stage slug ("league-phase", "playoff-round", ...).
export function stageLabel(stage: string | null): string {
  switch (stage) {
    case "league-phase":
      return "League Phase";
    case "first-round":
      return "First Qualifying Round";
    case "second-round":
      return "Second Qualifying Round";
    case "third-round":
      return "Third Qualifying Round";
    case "playoff-round":
      return "Play-off Round";
    case "knockout-playoff":
    case "knockout-round-playoffs":
      return "Knockout Play-offs";
    case "round-of-32":
      return "Round of 32";
    case "round-of-16":
      return "Round of 16";
    case "quarterfinals":
      return "Quarter-finals";
    case "semifinals":
      return "Semi-finals";
    case "3rd-place-match":
      return "Third Place";
    case "final":
      return "Final";
    case "group-stage":
      return "Group Stage";
    default:
      return stage
        ? stage.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "";
  }
}

// Qualifying stages (played under the *_qual ESPN slug). Everything else is
// the main phase.
export const QUALIFYING_STAGES = new Set([
  "first-round",
  "second-round",
  "third-round",
  "playoff-round",
]);
