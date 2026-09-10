import { after } from "next/server";
import Link from "next/link";
import { todayIsoDate } from "@/lib/date";
import { maybeRefresh } from "@/lib/ingest/refresh";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { refreshFixturesWindow } from "@/lib/sports/soccer/live";
import {
  currentRound,
  getBankoPicks,
  getEngineCoupons,
  getFinalMatch,
  getMatchesByDates,
  getRecentSettledPicks,
  getRounds,
  getSoccerScore,
  getStandings,
  type MatchRow as MatchRowT,
} from "@/lib/sports/soccer/queries";
import { getSoccerEngineStats } from "@/lib/scoring/stats";
import { BankoCard } from "@/components/soccer/BankoCard";
import { CouponCard } from "@/components/soccer/CouponCard";
import { MatchRow } from "@/components/soccer/MatchRow";
import { SettledPickRow } from "@/components/soccer/SettledPickRow";
import { StandingsTable } from "@/components/soccer/StandingsTable";
import { Hero } from "@/components/site/Hero";
import { PillarRow } from "@/components/site/PillarRow";
import { SectionHeading } from "@/components/site/SectionHeading";

export const dynamic = "force-dynamic";

// Gold wordmark accent — same treatment the NBA home uses on its section
// titles, so both sports read as one brand. Inside the Champions League scope
// the accent word goes silver-lit instead (see .ucl-silver-text).
const GOLD = {
  background: "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
} as const;

// The one lit word in a section title: silver-blue inside the Champions
// League scope, brand gold everywhere else.
function Accent({
  theme,
  children,
}: {
  theme: "ucl" | "wc";
  children: React.ReactNode;
}) {
  return theme === "ucl" ? (
    <span className="ucl-sky-text">{children}</span>
  ) : (
    <span style={GOLD}>{children}</span>
  );
}

function dayHeading(date: string, today: string): string {
  if (date === today) return "Today";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default async function FootballHome() {
  const competition = await activeCompetition();
  const meta = COMPETITIONS[competition];
  const live = meta.status === "live";
  const theme = meta.theme;

  if (live) {
    // Keep DB fixtures/scores fresh on visit (the sync cron only runs daily),
    // throttled to once every 2 min and single-flight across visitors.
    after(() =>
      maybeRefresh({
        key: `soccer_fixtures:${competition}`,
        staleAfterMs: 2 * 60_000,
        run: () => refreshFixturesWindow(competition),
      }),
    );
  }

  const today = todayIsoDate();
  const [banko, coupons, stats, rounds, standings] = await Promise.all([
    getBankoPicks(competition),
    getEngineCoupons(competition),
    getSoccerEngineStats(competition),
    getRounds(competition),
    getStandings(competition),
  ]);
  const round = currentRound(rounds, today);

  const topBanko = banko.slice(0, 3);
  const headlineCoupons = coupons
    .filter((c) => c.target_multiplier !== null || c.kind === "surprise")
    .slice(0, 3);

  if (!live) {
    return (
      <ArchiveHome
        competition={competition}
        stats={stats}
        finalMatch={await getFinalMatch(competition)}
        recent={await getRecentSettledPicks(competition, 8)}
        ledger={await getSoccerScore(competition)}
        today={today}
      />
    );
  }

  // The matchday in focus: its fixtures grouped by LA-day, today first when
  // the round is in progress.
  const focusMatches = round?.matches ?? (await getMatchesByDates(competition, [today]));
  const byDate = new Map<string, MatchRowT[]>();
  for (const m of focusMatches) {
    const list = byDate.get(m.date) ?? [];
    list.push(m);
    byDate.set(m.date, list);
  }
  const focusDates = [...byDate.keys()].sort();

  const tableKey = [...standings.keys()][0];
  const tableRows = tableKey ? (standings.get(tableKey) ?? []) : [];
  const leaguePhase = standings.size === 1 && tableRows.length > 8;

  const heroEyebrow = round
    ? `${meta.label} · ${round.label}`
    : `${meta.label} · ${meta.seasonLabel}`;

  return (
    <div className="fade-up">
      <Hero
        stats={stats}
        eyebrow={heroEyebrow}
        subtitle="Europe's elite, priced by forty books and de-vigged to the real probability, nudged by the league table. Every pick graded after the final whistle."
        primaryCta={{ href: "/football/picks", label: "This Matchday's Picks" }}
        secondaryCta={{ href: "/football/standings", label: "League Table" }}
      />

      {topBanko.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <SectionHeading
            eyebrow={`${meta.label} · Locks`}
            title={
              <>
                🔒 Most <Accent theme={theme}>Trusted</Accent>
              </>
            }
            trailing={
              <Link
                href="/football/picks"
                className="text-sm font-semibold text-primary hover:text-primary-hover"
              >
                All picks →
              </Link>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topBanko.map((p) => (
              <BankoCard key={p.id} pick={p} />
            ))}
          </div>
        </section>
      ) : null}

      {headlineCoupons.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <SectionHeading
            eyebrow={`${meta.label} · Parlays`}
            title={
              <>
                Double · Triple · <Accent theme={theme}>10× Your Money</Accent>
              </>
            }
          />
          <div className="grid gap-4 md:grid-cols-3">
            {headlineCoupons.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <SectionHeading
          eyebrow={round ? `${meta.label} · ${round.label}` : `${meta.label} · Today`}
          title={
            <>
              {round?.kind === "league" ? (
                <>
                  Matchday <Accent theme={theme}>{round.label.replace("Matchday ", "")}</Accent>
                </>
              ) : (
                <>
                  This <Accent theme={theme}>Week</Accent>
                </>
              )}
            </>
          }
          trailing={
            <Link
              href="/football/schedule"
              className="text-sm font-semibold text-primary hover:text-primary-hover"
            >
              Full schedule →
            </Link>
          }
        />
        {focusDates.length > 0 ? (
          <div className="space-y-8">
            {focusDates.map((d) => (
              <div key={d} className="space-y-2">
                <h3 className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/45 sm:text-left">
                  {dayHeading(d, today)}
                </h3>
                {(byDate.get(d) ?? []).map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-8 text-center text-sm text-foreground/55">
            No matches scheduled this week. Check the{" "}
            <Link href="/football/schedule" className="font-semibold text-primary">
              schedule
            </Link>
            .
          </p>
        )}
      </section>

      {leaguePhase ? (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <SectionHeading
            eyebrow={`${meta.label} · ${meta.phaseLabel}`}
            title={
              <>
                The <Accent theme={theme}>Top Eight</Accent>
              </>
            }
            trailing={
              <Link
                href="/football/standings"
                className="text-sm font-semibold text-primary hover:text-primary-hover"
              >
                Full 36-team table →
              </Link>
            }
          />
          <div className="mx-auto max-w-4xl">
            <StandingsTable
              group="Round of 16 places"
              rows={tableRows.slice(0, 8)}
              format="league-phase"
              competition={competition}
            />
          </div>
        </section>
      ) : null}

      <PillarRow />
    </div>
  );
}

// The World Cup (or any finished competition): the record, not a slate. No
// refreshes, no "today" — the final, the ledger, the last graded picks.
async function ArchiveHome({
  competition,
  stats,
  finalMatch,
  recent,
  ledger,
  today,
}: {
  competition: Parameters<typeof getFinalMatch>[0];
  stats: Awaited<ReturnType<typeof getSoccerEngineStats>>;
  finalMatch: MatchRowT | null;
  recent: Awaited<ReturnType<typeof getRecentSettledPicks>>;
  ledger: Awaited<ReturnType<typeof getSoccerScore>>;
  today: string;
}) {
  const meta = COMPETITIONS[competition];
  const settled = ledger.wins + ledger.losses;
  const hitRate = settled > 0 ? Math.round((ledger.wins / settled) * 100) : 0;
  const champion =
    finalMatch &&
    (finalMatch.home_score > finalMatch.away_score
      ? finalMatch.home
      : finalMatch.away_score > finalMatch.home_score
        ? finalMatch.away
        : null);
  void today;

  return (
    <div className="fade-up">
      <Hero
        stats={stats}
        eyebrow={`${meta.fullName} · Archived record`}
        subtitle="Tournament complete. Every pick, price and result stays exactly as it was graded — switch to the Champions League for the live slate."
        primaryCta={{ href: "/football/scoreboard", label: "Final Ledger" }}
        secondaryCta={{ href: "/football/schedule", label: "Every Result" }}
      />

      {finalMatch ? (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <SectionHeading
            eyebrow={`${meta.label} · The Final`}
            title={
              <>
                {champion ? (
                  <>
                    <span style={GOLD}>{champion.name}</span> are champions
                  </>
                ) : (
                  <>
                    The <span style={GOLD}>Final</span>
                  </>
                )}
              </>
            }
          />
          <MatchRow match={finalMatch} caption={finalMatch.status} />
        </section>
      ) : null}

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <SectionHeading
          eyebrow={`${meta.label} · Engine record`}
          title={
            <>
              How the engine <span style={GOLD}>finished</span>
            </>
          }
          trailing={
            <Link
              href="/football/scoreboard"
              className="text-sm font-semibold text-primary hover:text-primary-hover"
            >
              Units graph →
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "Net units",
              value: `${ledger.score > 0 ? "+" : ""}${ledger.score}`,
              tone: ledger.score > 0 ? "text-emerald-400" : ledger.score < 0 ? "text-rose-400" : "",
            },
            { label: "Wins", value: String(ledger.wins), tone: "text-emerald-400" },
            { label: "Losses", value: String(ledger.losses), tone: "text-rose-400" },
            { label: "Hit rate", value: `${hitRate}%`, tone: "" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border/60 bg-card/40 px-5 py-4 text-center"
            >
              <div className={`text-3xl font-black tabular-nums ${s.tone}`}>{s.value}</div>
              <div className="mt-1 text-xs uppercase tracking-wide text-foreground/50">
                {s.label}
              </div>
            </div>
          ))}
        </div>
        {recent.length > 0 ? (
          <div className="mt-6 divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
            {recent.map((p) => (
              <SettledPickRow key={p.id} pick={p} />
            ))}
          </div>
        ) : null}
      </section>

      <PillarRow />
    </div>
  );
}
