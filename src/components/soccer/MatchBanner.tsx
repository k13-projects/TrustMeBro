import Image from "next/image";
import { LocalTime } from "@/components/site/LocalTime";
import {
  COMPETITIONS,
  DEFAULT_COMPETITION,
  type SoccerCompetition,
} from "@/lib/sports/soccer/competitions";

type TeamLite = {
  name: string;
  abbreviation?: string;
  crest: string | null;
  /** Club brand colour (hex, no '#'). Drives the pill's edge accent. */
  color?: string | null;
};

function kickoff(datetime: string | null): string {
  if (!datetime) return "TBD";
  return new Date(datetime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

// ESPN club colours arrive as bare hex. Near-black ones vanish on the black
// pill, so fall back to the competition silver.
export function accentColor(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.14) return "#c9d3e6";
  return `#${h}`;
}

function CrestCell({
  crest,
  alt,
  sm,
  kind,
}: {
  crest: string | null;
  alt: string;
  sm: boolean;
  kind: "flag" | "crest";
}) {
  // The box keeps the same layout footprint, but the image renders at ~2x and
  // overflows it (centered) so it reads big and "pops" without reflowing the
  // pill or colliding with the team name. overflow stays visible.
  const box = sm ? "h-4 w-6" : "h-8 w-11";
  const place =
    "absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 pointer-events-none";
  const flag = sm ? "h-7 w-[2.625rem]" : "h-14 w-20";
  const badge = sm ? "size-8" : "size-14 sm:size-16";
  return (
    <span className={`relative shrink-0 ${box}`}>
      {crest ? (
        kind === "flag" ? (
          <Image
            src={crest}
            alt={alt}
            width={80}
            height={56}
            className={`${place} ${flag} rounded object-cover ring-1 ring-white/20 drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] sm:rounded-md`}
            unoptimized
          />
        ) : (
          <Image
            src={crest}
            alt={alt}
            width={80}
            height={80}
            className={`${place} ${badge} object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.65)]`}
            unoptimized
          />
        )
      ) : (
        <span
          className={`${place} ${flag} flex items-center justify-center rounded bg-white/10 text-[10px] font-bold text-white/70 ring-1 ring-white/20 sm:rounded-md`}
        >
          {alt.slice(0, 3).toUpperCase()}
        </span>
      )}
    </span>
  );
}

// The segmented "versus" banner: two black pills (team name + crest) flanking
// the competition emblem. The single matchup style used everywhere in the
// football section. `size="sm"` is the compact variant for picks/coupons (no
// score/status footer — those contexts are upcoming-match matchups).
// Clubs get a thin brand-colour edge on their pill; national teams get flags.
export function MatchBanner({
  home,
  away,
  score = null,
  state = "pre",
  clock = null,
  datetime = null,
  size = "lg",
  pending = false,
  competition = DEFAULT_COMPETITION,
  label = null,
}: {
  home: TeamLite;
  away: TeamLite;
  score?: { home: number; away: number } | null;
  state?: "pre" | "in" | "post";
  clock?: string | null;
  datetime?: string | null;
  size?: "lg" | "sm";
  /** Imminent kickoff, waiting for the first live score — shimmer the score. */
  pending?: boolean;
  competition?: SoccerCompetition;
  /** Small caption under the medallion (round, leg, venue). Large size only. */
  label?: string | null;
}) {
  const sm = size === "sm";
  const live = state === "in";
  const done = state === "post";
  const showScore = !!score && (live || done);
  const meta = COMPETITIONS[competition];
  const kind: "flag" | "crest" = meta.kind === "national" ? "flag" : "crest";
  const homeAccent = kind === "crest" ? accentColor(home.color) : null;
  const awayAccent = kind === "crest" ? accentColor(away.color) : null;

  // Every match renders at ONE fixed width (max-w-3xl, w-full) so the black
  // boxes are all identical regardless of name length. The pills split it
  // 50/50 (flex-1); the crest sits at the outer edge and the name fills toward
  // the centre. gap = crest↔name padding; pr/pl = minimum name↔emblem gap.
  const pillBase = "relative flex min-w-0 flex-1 items-center bg-black";
  // Phones get tighter gaps and a two-line name (clubs like "Manchester
  // United" don't fit one line at 390px); ≥sm keeps the single-line truncate.
  const pill = sm
    ? `${pillBase} gap-3 py-1.5 text-xs`
    : `${pillBase} gap-3 py-2.5 text-[13px] sm:gap-6 sm:py-3 sm:text-xl`;
  // Phones wrap to two lines. A long single word ("Internazionale") has no
  // break opportunity, so allow one inside the word rather than slicing the
  // name off mid-glyph; from sm there is room to truncate with an ellipsis.
  const name = sm
    ? "min-w-0 flex-1 truncate font-display uppercase tracking-wide text-white"
    : "min-w-0 flex-1 font-display uppercase tracking-wide leading-[1.05] text-white line-clamp-2 [overflow-wrap:anywhere] sm:line-clamp-none sm:truncate sm:[overflow-wrap:normal]";

  return (
    <div className="relative mx-auto flex w-full max-w-3xl items-stretch">
      {/* Home — crest at the outer edge, name fills toward the emblem */}
      <div
        className={`${pill} rounded-l-full ${sm ? "rounded-r-md pl-3 pr-5" : "rounded-r-lg pl-4 pr-7 sm:pl-5 sm:pr-8"}`}
        style={
          homeAccent
            ? { boxShadow: `inset ${sm ? 3 : 4}px 0 0 0 ${homeAccent}` }
            : undefined
        }
      >
        <CrestCell crest={home.crest} alt={home.abbreviation || home.name} sm={sm} kind={kind} />
        <span className={`${name} text-left`}>{home.name}</span>
      </div>

      {/* Center medallion */}
      <div
        className={`relative z-10 flex flex-col items-center justify-center ${sm ? "-mx-3" : "-mx-5 sm:-mx-6"}`}
      >
        <span
          className={`flex items-center justify-center rounded-full bg-black ring-2 ring-background ${
            sm ? "size-8" : "size-14 sm:size-16"
          }`}
        >
          {/* ~2x the medallion's icon so the emblem overflows and pops out. */}
          <Image
            src={meta.logo}
            alt={meta.label}
            width={80}
            height={80}
            className={`object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] ${
              sm ? "size-8" : "size-[3.6rem] sm:size-16"
            }`}
            unoptimized
          />
        </span>
        {!sm && showScore ? (
          <span className="mt-1 rounded-full bg-black px-2 py-0.5 text-sm font-black tabular-nums text-white ring-2 ring-background">
            {score.home}–{score.away}
          </span>
        ) : !sm && pending ? (
          <span className="mt-1 rounded-full bg-black px-3 py-1 ring-2 ring-background">
            <span className="block h-3 w-9 animate-pulse rounded bg-white/25" />
          </span>
        ) : null}
        {!sm ? (
          <span
            className={`mt-1.5 text-xs sm:text-sm font-bold uppercase tracking-wide tabular-nums ${
              done ? "text-foreground/55" : "text-primary"
            }`}
          >
            {live ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                {clock ?? "LIVE"}
              </span>
            ) : done ? (
              "FT"
            ) : pending ? (
              "KICKOFF"
            ) : (
              <LocalTime iso={datetime} fallback={kickoff(datetime)} />
            )}
          </span>
        ) : null}
        {!sm && label ? (
          <span className="mt-0.5 max-w-[9rem] truncate text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/40">
            {label}
          </span>
        ) : null}
      </div>

      {/* Away — name fills toward the emblem, crest at the outer edge */}
      <div
        className={`${pill} rounded-r-full ${sm ? "rounded-l-md pr-3 pl-5" : "rounded-l-lg pr-4 pl-7 sm:pr-5 sm:pl-8"}`}
        style={
          awayAccent
            ? { boxShadow: `inset -${sm ? 3 : 4}px 0 0 0 ${awayAccent}` }
            : undefined
        }
      >
        <span className={`${name} text-right`}>{away.name}</span>
        <CrestCell crest={away.crest} alt={away.abbreviation || away.name} sm={sm} kind={kind} />
      </div>
    </div>
  );
}
