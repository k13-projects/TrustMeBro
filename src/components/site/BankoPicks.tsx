import { PickCard } from "@/components/site/PickCard";
import { SectionHeading } from "@/components/site/SectionHeading";
import type { PredictionRow, TeamLite } from "@/components/types";

export type BankoRow = {
  label: string;
  date: string;
  picks: PredictionRow[];
};

type Props = {
  rows: BankoRow[];
  teamById: Map<number, TeamLite>;
};

// BANKO = the most trusted locks of the day (banko: a near-sure thing).
// Highest-confidence picks for today + tomorrow, deliberately EXCLUDING the
// ⭐ Bet of the Day so this is a distinct set, not a repeat of the headline.
export function BankoPicks({ rows, teamById }: Props) {
  const hasAny = rows.some((r) => r.picks.length > 0);
  if (!hasAny) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-2 pb-6 space-y-8">
      <SectionHeading
        eyebrow="NBA · Most Trusted"
        title={
          <>
            <span
              style={{
                background: "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              BANKO
            </span>{" "}
            Picks
          </>
        }
      />
      <p className="text-sm text-muted-foreground -mt-5">
        Our highest-confidence locks — separate from the{" "}
        <span className="text-primary font-semibold">★ Bet of the Day</span>.
      </p>

      {rows.map((row) => (
        <div key={row.date} className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="font-display uppercase text-lg tracking-tight text-foreground">
              {row.label}
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {row.date}
            </span>
            <span className="h-px flex-1 bg-border/60" aria-hidden />
          </div>

          {row.picks.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {row.picks.map((p) => (
                <PickCard
                  key={p.id}
                  prediction={p}
                  team={teamById.get(p.player.team_id ?? -1) ?? null}
                  href={`/players/${p.player.id}`}
                  odds="-110"
                />
              ))}
            </div>
          ) : (
            <div className="card-tmb p-5 text-sm text-muted-foreground text-center">
              No locks for {row.label.toLowerCase()} yet — picks refresh each day.
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
