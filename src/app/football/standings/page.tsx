import { getStandings } from "@/lib/sports/soccer/queries";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { StandingsTable } from "@/components/soccer/StandingsTable";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  const byGroup = await getStandings();
  const groups = [...byGroup.keys()].sort();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      <FootballHeader title="Standings" />

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
