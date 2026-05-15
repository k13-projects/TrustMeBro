// Team colors + ESPN CDN URL helpers for logos and headshots.
// ESPN abbreviations are the source of truth (matches what espnProvider returns).

export type TeamColors = { primary: string; secondary: string };

const COLORS: Record<string, TeamColors> = {
  ATL: { primary: "#E03A3E", secondary: "#C1D32F" },
  BOS: { primary: "#007A33", secondary: "#BA9653" },
  BKN: { primary: "#000000", secondary: "#A1A1A1" },
  CHA: { primary: "#1D1160", secondary: "#00788C" },
  CHI: { primary: "#CE1141", secondary: "#000000" },
  CLE: { primary: "#860038", secondary: "#FDBB30" },
  DAL: { primary: "#00538C", secondary: "#002B5E" },
  DEN: { primary: "#0E2240", secondary: "#FEC524" },
  DET: { primary: "#C8102E", secondary: "#1D42BA" },
  GS: { primary: "#1D428A", secondary: "#FFC72C" },
  GSW: { primary: "#1D428A", secondary: "#FFC72C" },
  HOU: { primary: "#CE1141", secondary: "#000000" },
  IND: { primary: "#002D62", secondary: "#FDBB30" },
  LAC: { primary: "#C8102E", secondary: "#1D428A" },
  LAL: { primary: "#552583", secondary: "#FDB927" },
  MEM: { primary: "#5D76A9", secondary: "#12173F" },
  MIA: { primary: "#98002E", secondary: "#F9A01B" },
  MIL: { primary: "#00471B", secondary: "#EEE1C6" },
  MIN: { primary: "#0C2340", secondary: "#78BE20" },
  NO: { primary: "#0C2340", secondary: "#C8102E" },
  NOP: { primary: "#0C2340", secondary: "#C8102E" },
  NY: { primary: "#006BB6", secondary: "#F58426" },
  NYK: { primary: "#006BB6", secondary: "#F58426" },
  OKC: { primary: "#007AC1", secondary: "#EF3B24" },
  ORL: { primary: "#0077C0", secondary: "#C4CED4" },
  PHI: { primary: "#006BB6", secondary: "#ED174C" },
  PHX: { primary: "#1D1160", secondary: "#E56020" },
  POR: { primary: "#E03A3E", secondary: "#FFFFFF" },
  SAC: { primary: "#5A2D81", secondary: "#63727A" },
  SA: { primary: "#C4CED4", secondary: "#000000" },
  SAS: { primary: "#C4CED4", secondary: "#000000" },
  TOR: { primary: "#CE1141", secondary: "#000000" },
  UTA: { primary: "#002B5C", secondary: "#00471B" },
  UTAH: { primary: "#002B5C", secondary: "#00471B" },
  WAS: { primary: "#002B5C", secondary: "#E31837" },
  WSH: { primary: "#002B5C", secondary: "#E31837" },
};

const FALLBACK_COLORS: TeamColors = { primary: "#6B7280", secondary: "#1F2937" };

export function teamColors(abbreviation: string | null | undefined): TeamColors {
  if (!abbreviation) return FALLBACK_COLORS;
  return COLORS[abbreviation.toUpperCase()] ?? FALLBACK_COLORS;
}

export function teamLogoUrl(abbreviation: string | null | undefined): string | null {
  if (!abbreviation) return null;
  return `https://a.espncdn.com/i/teamlogos/nba/500/${abbreviation.toLowerCase()}.png`;
}

export function playerHeadshotUrl(playerId: number | null | undefined): string | null {
  if (!playerId) return null;
  return `https://a.espncdn.com/i/headshots/nba/players/full/${playerId}.png`;
}

export function initials(firstName: string, lastName: string): string {
  const f = firstName?.[0] ?? "";
  const l = lastName?.[0] ?? "";
  return `${f}${l}`.toUpperCase();
}
