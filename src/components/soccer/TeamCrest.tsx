import Image from "next/image";

// Club crest (badge). Unlike national flags these aren't rectangles, so they
// render contained, unclipped, with a soft drop shadow. Falls back to a
// monogram chip when ESPN ships no logo.
export function TeamCrest({
  crest,
  name,
  size = 22,
  className = "",
}: {
  crest: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  if (!crest) {
    return (
      <span
        aria-label={`${name} crest`}
        style={{ width: size, height: size }}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-foreground/70 ring-1 ring-white/15 ${className}`}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <Image
      src={crest}
      alt={`${name} crest`}
      width={size * 2}
      height={size * 2}
      style={{ width: size, height: size }}
      className={`shrink-0 object-contain drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] ${className}`}
      unoptimized
    />
  );
}
