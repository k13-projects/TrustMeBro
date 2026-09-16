import { todayIsoDate } from "@/lib/date";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { getLiveCompetitionSignals } from "@/lib/sports/soccer/live-signals";
import { currentRound, getRounds } from "@/lib/sports/soccer/queries";
import { CompetitionBar } from "@/components/soccer/CompetitionBar";
import { ProviderBanner } from "@/components/soccer/ProviderBanner";

export const dynamic = "force-dynamic";

// Every /football page renders inside the active competition's scope: the
// data-competition attribute switches the section's design tokens (see
// globals.css), and the bar on top names the competition + phase and hosts
// the switcher. Pages read the same cookie for their data.
export default async function FootballLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // activeCompetition() already calls getLiveCompetitionSignals() when there
  // is no cookie to pick the default — both calls hit the same cache() entry
  // for this request, so this costs nothing extra.
  const [competition, { byCompetition: liveSignals }] = await Promise.all([
    activeCompetition(),
    getLiveCompetitionSignals(),
  ]);
  const meta = COMPETITIONS[competition];

  let phase: string | null = null;
  if (meta.status === "live") {
    const rounds = await getRounds(competition);
    const round = currentRound(rounds, todayIsoDate());
    if (round) {
      phase =
        round.kind === "league"
          ? `${meta.phaseLabel} · ${round.label}`
          : round.label;
    }
  } else {
    phase = "Tournament complete";
  }

  return (
    <div
      data-competition={competition}
      className={meta.theme === "wc" ? undefined : "ucl-starfield"}
    >
      <div className="relative">
        <CompetitionBar
          competition={competition}
          phase={phase}
          liveSignals={Object.fromEntries(liveSignals)}
        />
        <ProviderBanner />
        {children}
      </div>
    </div>
  );
}
