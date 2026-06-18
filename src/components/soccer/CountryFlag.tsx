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
  // The box reserves `size` for layout; the crest itself renders at 2x and
  // overflows it (centered) so the flag reads big without widening the row.
  const big = size * 2;
  if (!crest) {
    return (
      <span
        aria-label={label}
        style={{ width: size, height: size }}
        className="relative inline-flex shrink-0 align-middle"
      >
        <span
          style={{ width: big, height: big }}
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[4px] bg-white/10 text-[10px] font-bold text-foreground/70 ring-1 ring-white/15"
        >
          {(abbr || name || "?").slice(0, 3).toUpperCase()}
        </span>
      </span>
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="relative inline-flex shrink-0 align-middle"
    >
      <Image
        src={crest}
        alt={label}
        width={big}
        height={big}
        style={{ width: big, height: big }}
        className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 rounded-[4px] object-contain drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]"
        unoptimized
      />
    </span>
  );
}
