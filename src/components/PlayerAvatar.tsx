import Image from "next/image";
import { initials, playerHeadshotUrl, teamColors } from "@/lib/sports/nba/branding";

type Variant = "round" | "sticker";

export function PlayerAvatar({
  playerId,
  firstName,
  lastName,
  abbreviation,
  size = 80,
  variant = "round",
}: {
  playerId: number;
  firstName: string;
  lastName: string;
  abbreviation: string;
  size?: number;
  variant?: Variant;
}) {
  const url = playerHeadshotUrl(playerId);
  const colors = teamColors(abbreviation);

  if (variant === "sticker") {
    // Sticker variant: transparent square frame, white+gold outline via
    // stacked drop-shadows in the .sticker-headshot utility. Background
    // disc tinted in team colours so the cutout reads even before the
    // photo loads.
    return (
      <div
        className="relative shrink-0 grid place-items-center"
        style={{ width: size, height: size }}
      >
        <div
          aria-hidden
          className="absolute inset-[10%] rounded-full blur-2xl opacity-60"
          style={{
            background: `radial-gradient(50% 50% at 50% 50%, ${colors.primary}, transparent 70%)`,
          }}
        />
        {url ? (
          <Image
            src={url}
            alt={`${firstName} ${lastName}`}
            width={size * 2}
            height={size * 2}
            className="sticker-headshot relative size-full object-contain object-bottom"
            unoptimized
          />
        ) : (
          <span
            className="relative grid place-items-center font-semibold text-white/95 rounded-full size-[70%]"
            style={{
              fontSize: size * 0.32,
              background: `radial-gradient(circle at 50% 30%, ${colors.primary}, ${colors.secondary} 80%)`,
              boxShadow: `0 0 0 3px #fff, 0 0 0 6px ${colors.primary}, 0 8px 24px rgba(0,0,0,0.45)`,
            }}
          >
            {initials(firstName, lastName)}
          </span>
        )}
      </div>
    );
  }

  // Default round variant — used by existing roster tiles, combo rows, etc.
  // Kept identical to the original so we don't ripple-break the rest of the app.
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
