import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { getMatchesByDates } from "@/lib/sports/soccer/queries";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { MatchRow } from "@/components/soccer/MatchRow";

export const dynamic = "force-dynamic";

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === isoDateOffset(today, 1)) return "Tomorrow";
  if (date === isoDateOffset(today, -1)) return "Yesterday";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default async function SchedulePage() {
  const today = todayIsoDate();
  // Yesterday → +6 days.
  const dates: string[] = [];
  for (let i = -1; i <= 6; i++) dates.push(isoDateOffset(today, i));
  const matches = await getMatchesByDates(dates);

  const byDate = new Map<string, typeof matches>();
  for (const m of matches) {
    const list = byDate.get(m.date) ?? [];
    list.push(m);
    byDate.set(m.date, list);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      <FootballHeader title="Schedule" />

      {dates
        .filter((d) => byDate.has(d))
        .map((d) => (
          <section key={d} className="space-y-3">
            <h2 className="font-display uppercase text-lg tracking-wide text-foreground/70">
              {dayLabel(d, today)}
            </h2>
            <div className="space-y-2">
              {(byDate.get(d) ?? []).map((m) => (
                <MatchRow key={m.id} match={m} />
              ))}
            </div>
          </section>
        ))}

      {matches.length === 0 ? (
        <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-foreground/55">
          No fixtures in range. The sync job populates matches daily.
        </p>
      ) : null}
    </div>
  );
}
