import type { CompetitionTheme } from "@/lib/sports/soccer/competitions";

// Share-card palette per competition. Separate from the app's CSS variables
// on purpose — ImageResponse renders outside the page, so custom properties
// aren't reachable and every color has to be a literal hex here.
export type ShareTheme = {
  accent: string;
  bg: string;
  bgTo: string;
};

export const SHARE_THEME: Record<CompetitionTheme, ShareTheme> = {
  ucl: { accent: "#4FA6FF", bg: "#0A1B4F", bgTo: "#050B24" },
  uel: { accent: "#FF7A1A", bg: "#0A0A0C", bgTo: "#000000" },
  uecl: { accent: "#22C55E", bg: "#0A0A0C", bgTo: "#000000" },
  wc: { accent: "#FFD700", bg: "#000000", bgTo: "#0A0A0C" },
};

// TrustMeBro gold — the brand wordmark, constant across every competition.
export const BRAND_GOLD = "#FFB800";
export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;
