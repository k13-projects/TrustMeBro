import Image from "next/image";
import { initials, playerHeadshotUrl, teamColors } from "@/lib/sports/nba/branding";

export function PlayerAvatar({
  playerId,
  firstName,
  lastName,
  abbreviation,
  size = 80,
}: {
  playerId: number;
  firstName: string;
  lastName: string;
  abbreviation: string;
  size?: number;
}) {
  const url = playerHeadshotUrl(playerId);
  const colors = teamColors(abbreviation);
  const ring = `0 0 0 2px ${colors.primary}`;
  return (
    <div
      className="relative rounded-full overflow-hidden shrink-0"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 30%, ${colors.primary}, ${colors.secondary} 75%)`,
        boxShadow: ring,
      }}
    >
      {url ? (
        <Image
          src={url}
          alt={`${firstName} ${lastName}`}
          width={size * 2}
          height={size * 2}
          className="absolute inset-0 size-full object-cover object-top scale-110"
          unoptimized
        />
      ) : (
        <span
          className="absolute inset-0 grid place-items-center font-semibold text-white/95"
          style={{ fontSize: size * 0.35 }}
        >
          {initials(firstName, lastName)}
        </span>
      )}
    </div>
  );
}
