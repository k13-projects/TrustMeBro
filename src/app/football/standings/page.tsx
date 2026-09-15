import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { getStandings } from "@/lib/sports/soccer/queries";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { StandingsTable } from "@/components/soccer/StandingsTable";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  const competition = await activeCompetition();
  const meta = COMPETITIONS[competition];
  const byGroup = await getStandings(competition);
  const groups = [...byGroup.keys()].sort();
  const totalTeams = groups.length === 1 ? (byGroup.get(groups[0])?.length ?? 0) : 0;
  const leaguePhase = groups.length === 1 && totalTeams > 8;
  const qualificationZones = meta.qualificationZones;

  return (
    <div className={`mx-auto space-y-8 px-4 py-10 ${leaguePhase ? "max-w-4xl" : "max-w-5xl"}`}>
      <div>
        <FootballHeader
          title={leaguePhase ? "League Table" : "Standings"}
          competition={competition}
        />
        {leaguePhase && qualificationZones ? (
          <p className="mt-2 max-w-2xl text-sm text-foreground/55">
            One {totalTeams}-team table, eight matchdays. Top eight go straight to the
            Round of 16; ninth to twenty-fourth play off for the remaining
            eight places; the bottom twelve go out of Europe.
          </p>
        ) : leaguePhase ? (
          <p className="mt-2 max-w-2xl text-sm text-foreground/55">
            One {totalTeams}-team table, {meta.phaseLabel.toLowerCase()}.
          </p>
        ) : meta.status === "archived" ? (
          <p className="mt-2 text-sm text-foreground/55">
            Final group tables as the tournament finished.
          </p>
        ) : null}
      </div>

      {groups.length > 0 ? (
        leaguePhase ? (
          <StandingsTable
            group={meta.phaseLabel}
            rows={byGroup.get(groups[0]) ?? []}
            format="league-phase"
            competition={competition}
            qualificationZones={qualificationZones}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {groups.map((g) => (
              <StandingsTable
                key={g}
                group={g}
                rows={byGroup.get(g) ?? []}
                format="group"
                competition={competition}
              />
            ))}
          </div>
        )
      ) : (
        <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-10 text-center text-sm text-foreground/55">
          The table appears once the first matchday is played.
        </p>
      )}
    </div>
  );
}
