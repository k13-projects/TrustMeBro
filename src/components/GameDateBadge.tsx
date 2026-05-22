import { PROJECT_TIMEZONE, todayIsoDate, isoDateOffset } from "@/lib/date";

const SHORT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PROJECT_TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

function labelFor(isoDate: string): string {
  const today = todayIsoDate();
  if (isoDate === today) return "Today";
  if (isoDate === isoDateOffset(today, 1)) return "Tomorrow";
  if (isoDate === isoDateOffset(today, -1)) return "Yesterday";
  // Parse as a date-only value but format in project tz. Adding T12:00 avoids
  // the UTC-midnight-falls-into-yesterday-in-LA edge case.
  return SHORT_FORMATTER.format(new Date(`${isoDate}T12:00:00Z`));
}

type Props = {
  date: string;
  status?: string | null;
  className?: string;
};

/**
 * Compact "when does this pick settle" label. Today / Tomorrow get distinct
 * shades from the gold palette so the slate's two days read apart at a glance;
 * live and final lean on their data-viz tones. Full status stays in the
 * tooltip — no redundant "· scheduled" text cluttering the chip.
 */
export function GameDateBadge({ date, status, className }: Props) {
  const label = labelFor(date);
  const isFinal = (status ?? "").toLowerCase().includes("final");
  const isLive = !!status && /(in[\s-]?progress|q\d|halftime|live)/i.test(status);
  const tone = isFinal
    ? "border-white/15 text-foreground/55"
    : isLive
      ? "border-emerald-400/35 text-emerald-300"
      : label === "Today"
        ? "border-primary/45 text-primary"
        : label === "Tomorrow"
          ? "border-amber-400/25 text-amber-200/65"
          : "border-amber-400/30 text-amber-200/85";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono tabular-nums ${tone} ${className ?? ""}`}
      title={status ? `Game ${status} on ${date}` : `Game on ${date}`}
    >
      <span>{label}</span>
    </span>
  );
}
