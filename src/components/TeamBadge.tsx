import Image from "next/image";
import { teamLogoUrl } from "@/lib/sports/nba/branding";
import type { TeamLite } from "./types";

export function TeamBadge({
  team,
  size = 24,
}: {
  team: TeamLite | null;
  size?: number;
}) {
  if (!team) return null;
  const url = teamLogoUrl(team.abbreviation);
  if (!url) return null;
  return (
    <Image
      src={url}
      alt={team.abbreviation}
      width={size * 2}
      height={size * 2}
      className="shrink-0"
      style={{ width: size, height: size }}
      unoptimized
    />
  );
}
