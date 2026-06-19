import Image from "next/image";

// Center medallion. ESPN's World Cup trophy logo (CSP-allowed). To use the
// official FIFA 2026 "26" emblem instead, drop the file in /public and point
// EMBLEM at e.g. "/wc26-emblem.png" — served from 'self', so allowed.
const EMBLEM = "https://a.espncdn.com/i/leaguelogos/soccer/500/4.png";

type TeamLite = { name: string; abbreviation?: string; crest: string | null };

function kickoff(datetime: string | null): string {
  if (!datetime) return "TBD";
  return new Date(datetime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

function FlagCell({
  crest,
  alt,
  sm,
}: {
  crest: string | null;
  alt: string;
  sm: boolean;
}) {
  // The box keeps the same layout footprint, but the crest renders at ~2x and
  // overflows it (centered) so the flag reads big and "pops" without reflowing
  // the pill or colliding with the team name. overflow stays visible.
  const box = sm ? "h-4 w-6" : "h-8 w-11";
  const flag = sm ? "h-7 w-[2.625rem]" : "h-14 w-20";
  const place =
    "absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2";
  return (
    <span className={`relative shrink-0 ${box}`}>
      {crest ? (
        <Image
          src={crest}
          alt={alt}
          width={80}
          height={56}
          className={`${place} ${flag} rounded object-cover ring-1 ring-white/20 drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] sm:rounded-md pointer-events-none`}
          unoptimized
        />
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

// The segmented "versus" banner: two black pills (team name + flag) flanking
// the World Cup emblem. The single matchup style used everywhere in the World
// Cup section. `size="sm"` is the compact variant for picks/coupons (no
// score/status footer — those contexts are upcoming-match matchups).
export function MatchBanner({
  home,
  away,
  score = null,
  state = "pre",
  clock = null,
  datetime = null,
  size = "lg",
}: {
  home: TeamLite;
  away: TeamLite;
  score?: { home: number; away: number } | null;
  state?: "pre" | "in" | "post";
  clock?: string | null;
  datetime?: string | null;
  size?: "lg" | "sm";
}) {
  const sm = size === "sm";
  const live = state === "in";
  const done = state === "post";
  const showScore = !!score && (live || done);

  // Layout: flag at the outer edge of each side, country name pulled toward the
  // centre trophy (flag · name · TROPHY/time · name · flag). The whole banner is
  // width-capped and centred so it doesn't strand the matchup in a sea of black
  // on wide screens. `justify-between` parks the flag at the row edge and the
  // name beside the trophy; the inner padding is the name↔trophy breathing room.
  // Pills hug their content (no flex-1 stretching) and the whole matchup is
  // centred, so each side is a compact "flag · name" unit instead of being
  // strung across the full row with a sea of black between them. gap = flag↔name
  // padding; the inner padding (pr/pl) is the wider name↔trophy gap.
  // Every match renders at ONE fixed width (max-w-3xl, w-full) so the black
  // boxes are all identical regardless of name length — no more ragged rows.
  // The pills split it 50/50 (flex-1); the flag sits at the outer edge and the
  // name fills toward the centre, hugging the flag side (text-left/right) so the
  // gap to the trophy grows for short names and shrinks (to the inner padding)
  // for long ones. gap = flag↔name padding; pr/pl = minimum name↔trophy gap.
  const pillBase = "flex min-w-0 flex-1 items-center bg-black";
  const pill = sm
    ? `${pillBase} gap-3 py-1.5 text-xs`
    : `${pillBase} gap-6 py-3 text-base sm:text-xl`;
  const name = "min-w-0 flex-1 truncate font-display uppercase tracking-wide text-white";

  return (
    <div className="relative mx-auto flex w-full max-w-3xl items-stretch">
      {/* Home — flag at the outer edge, name fills toward the trophy */}
      <div
        className={`${pill} rounded-l-full ${sm ? "rounded-r-md pl-3 pr-5" : "rounded-r-lg pl-5 pr-8"}`}
      >
        <FlagCell crest={home.crest} alt={home.abbreviation || home.name} sm={sm} />
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
          {/* ~2x the medallion's icon so the trophy overflows and pops out. */}
          <Image
            src={EMBLEM}
            alt="World Cup"
            width={80}
            height={80}
            className={`object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] ${
              sm ? "size-10" : "size-[4.5rem] sm:size-20"
            }`}
            unoptimized
          />
        </span>
        {!sm && showScore ? (
          <span className="mt-1 rounded-full bg-black px-2 py-0.5 text-sm font-black tabular-nums text-white ring-2 ring-background">
            {score.home}–{score.away}
          </span>
        ) : null}
        {!sm ? (
          <span
            className={`mt-1.5 text-xs sm:text-sm font-bold uppercase tracking-wide tabular-nums ${
              done ? "text-foreground/55" : "text-primary"
            }`}
          >
            {live ? clock ?? "LIVE" : done ? "FT" : kickoff(datetime)}
          </span>
        ) : null}
      </div>

      {/* Away — name fills toward the trophy, flag at the outer edge */}
      <div
        className={`${pill} rounded-r-full ${sm ? "rounded-l-md pr-3 pl-5" : "rounded-l-lg pr-5 pl-8"}`}
      >
        <span className={`${name} text-right`}>{away.name}</span>
        <FlagCell crest={away.crest} alt={away.abbreviation || away.name} sm={sm} />
      </div>
    </div>
  );
}
