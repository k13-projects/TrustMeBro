import { after } from "next/server";
import Link from "next/link";
import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { maybeRefresh } from "@/lib/ingest/refresh";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { refreshFixturesWindow } from "@/lib/sports/soccer/live";
import { currentRound, getRounds } from "@/lib/sports/soccer/queries";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { MatchRow } from "@/components/soccer/MatchRow";
import { RoundNav } from "@/components/soccer/RoundNav";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ round?: string }> };

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

function rangeLabel(from: string, to: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const [{ round: requested }, competition] = await Promise.all([
    searchParams,
    activeCompetition(),
  ]);
  const meta = COMPETITIONS[competition];

  if (meta.status === "live") {
    after(() =>
      maybeRefresh({
        key: `soccer_fixtures:${competition}`,
        staleAfterMs: 2 * 60_000,
        run: () => refreshFixturesWindow(competition),
      }),
    );
  }

  const today = todayIsoDate();
  const rounds = await getRounds(competition);
  const round =
    rounds.find((r) => r.key === requested) ?? currentRound(rounds, today);

  const byDate = new Map<string, NonNullable<typeof round>["matches"]>();
  for (const m of round?.matches ?? []) {
    const list = byDate.get(m.date) ?? [];
    list.push(m);
    byDate.set(m.date, list);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <FootballHeader title="Schedule" competition={competition} />

      {rounds.length > 0 ? (
        <RoundNav
          rounds={rounds}
          activeKey={round?.key ?? null}
          basePath="/football/schedule"
          leagueLabel={meta.phaseLabel}
        />
      ) : null}

      {round ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/50 pb-3">
          <div>
            <h2 className="font-display text-2xl uppercase tracking-[0.04em] sm:text-3xl">
              {round.label}
            </h2>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {rangeLabel(round.from, round.to)} · {round.played}/{round.total} played
            </p>
          </div>
          {round.kind === "league" ? (
            <Link
              href="/football/standings"
              className="inline-block py-1 -my-1 text-sm font-semibold text-primary hover:text-primary-hover"
            >
              League table →
            </Link>
          ) : null}
        </div>
      ) : null}

      {dates.map((d) => (
        <section key={d} className="space-y-3">
          <h3 className="font-display text-lg uppercase tracking-wide text-foreground/70">
            {dayLabel(d, today)}
          </h3>
          <div className="space-y-2">
            {(byDate.get(d) ?? []).map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}

      {!round ? (
        <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-foreground/55">
          No fixtures loaded yet. The sync job populates matches daily.
        </p>
      ) : null}
    </div>
  );
}
