import Image from "next/image";

// Bro avatar — user-supplied URL with initials fallback. Tinted gold rim
// keeps it on-brand and visible against the dark surface.
export function BroAvatar({
  handle,
  displayName,
  avatarUrl,
  size = 48,
}: {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initialsFromName = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const inits = initialsFromName || handle.slice(0, 2).toUpperCase();

  return (
    <div
      className="relative rounded-full overflow-hidden shrink-0 grid place-items-center text-foreground/90"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 50% 30%, rgba(255,184,0,0.55), rgba(255,107,53,0.25) 75%)",
        boxShadow: "0 0 0 2px rgba(255,184,0,0.55)",
        fontSize: size * 0.36,
      }}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={displayName}
          width={size * 2}
          height={size * 2}
          className="absolute inset-0 size-full object-cover"
          unoptimized
        />
      ) : (
        <span className="font-semibold tracking-tight">{inits}</span>
      )}
    </div>
  );
}

