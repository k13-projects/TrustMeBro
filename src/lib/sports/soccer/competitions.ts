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
  | "uefa.europa.conf";

export const COMPETITION_COOKIE = "tmb_competition";
export const COMPETITION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type CompetitionTheme = "wc" | "ucl" | "uel" | "uecl";

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
  /** The Odds API sport key for the main phase. */
  oddsKey: string;
  /** ESPN league logo (light-on-dark variant) — used as emblem + toggle knob. */
  logo: string;
  emoji: string;
  theme: CompetitionTheme;
  /** Headline eyebrow on the section home. */
  tagline: string;
  /** Name for the current phase as a human label (headers, chat). */
  phaseLabel: string;
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
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/2.png",
    emoji: "⭐",
    theme: "ucl",
    tagline: "The best of Europe, every matchday",
    phaseLabel: "League Phase",
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
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/2310.png",
    emoji: "🟠",
    theme: "uel",
    tagline: "Thursday nights, the long road to the final",
    phaseLabel: "League Phase",
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
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/20296.png",
    emoji: "🟢",
    theme: "uecl",
    tagline: "Europe's third tier, first-time finalists every year",
    phaseLabel: "League Phase",
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
    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/4.png",
    emoji: "🏆",
    theme: "wc",
    tagline: "Tournament complete — the full record, preserved",
    phaseLabel: "Final",
  },
};

export const COMPETITION_ORDER: SoccerCompetition[] = [
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf",
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
