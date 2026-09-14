import Link from "next/link";
import type { Highlight, RoundEngineSummary } from "@/lib/sports/soccer/home-queries";
import type { Round } from "@/lib/sports/soccer/queries";
import { HomeFixtureRow } from "./HomeFixtureRow";

// The round just played, for someone arriving in the gap between matchdays:
// what stood out, how the engine did on it, and every result.
export function HomeReplay({
  round,
  highlights,
  engine,
}: {
  round: Round;
  highlights: Highlight[];
  engine: RoundEngineSummary | null;
}) {
  const results = round.matches.filter((m) => m.finished);
  if (results.length === 0) return null;

  return (
    <div className="space-y-5">
      {highlights.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((h) => (
            <div
              key={h.key}
              className="rounded-2xl border border-border/60 bg-card/40 px-4 py-3"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
                {h.label}
              </div>
              <div className="mt-1 font-display text-lg uppercase leading-tight tracking-[0.02em]">
                {h.headline}
              </div>
              <div className="mt-0.5 truncate text-xs text-foreground/50">{h.detail}</div>
            </div>
          ))}
        </div>
      ) : null}

      {engine ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/35 bg-primary/5 px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold">The engine on {round.label}:</span>{" "}
            <span className="text-emerald-400">{engine.won} won</span>
            {" · "}
            <span className="text-rose-400">{engine.lost} lost</span>
            {engine.voided > 0 ? ` · ${engine.voided} void` : ""}
            {" · "}
            <span
              className={
                engine.units > 0
                  ? "text-emerald-400"
                  : engine.units < 0
                    ? "text-rose-400"
                    : "text-foreground/70"
              }
            >
              {engine.units > 0 ? "+" : ""}
              {engine.units} units
            </span>
          </div>
          <Link
            href="/football/scoreboard"
            className="text-sm font-semibold text-primary hover:text-primary-hover"
          >
            Full ledger →
          </Link>
        </div>
      ) : null}

      <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card/30">
        {results.map((m) => (
          <HomeFixtureRow key={m.id} match={m} showResult />
        ))}
      </div>
    </div>
  );
}
