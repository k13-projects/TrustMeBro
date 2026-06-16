import { getStandings } from "@/lib/sports/soccer/queries";
import { StandingsTable } from "@/components/soccer/StandingsTable";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  const byGroup = await getStandings();
  const groups = [...byGroup.keys()].sort();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          ⚽ World Cup
        </p>
        <h1 className="mt-1 text-3xl font-black">Standings</h1>
      </header>

      {groups.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {groups.map((g) => (
            <StandingsTable key={g} group={g} rows={byGroup.get(g) ?? []} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-foreground/55">
          Standings appear once group play begins.
        </p>
      )}
    </div>
  );
}
