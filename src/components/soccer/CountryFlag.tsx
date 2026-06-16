import Image from "next/image";

// National-team flag/crest. ESPN serves these by country; when missing we fall
// back to a small abbreviation chip so the row never collapses.
export function CountryFlag({
  crest,
  abbr,
  name,
  size = 20,
}: {
  crest: string | null;
  abbr?: string;
  name?: string;
  size?: number;
}) {
  const label = `${name ?? abbr ?? "team"} flag`;
  if (!crest) {
    return (
      <span
        aria-label={label}
        style={{ width: size, height: size }}
        className="inline-flex items-center justify-center rounded-[3px] bg-white/10 text-[9px] font-bold text-foreground/70 shrink-0"
      >
        {(abbr || name || "?").slice(0, 3).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={crest}
      alt={label}
      width={size}
      height={size}
      className="inline-block shrink-0 rounded-[3px] object-contain"
      unoptimized
    />
  );
}
