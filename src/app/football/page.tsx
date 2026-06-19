import Link from "next/link";
import { todayIsoDate } from "@/lib/date";
import {
  getBankoPicks,
  getEngineCoupons,
  getMatchesByDates,
} from "@/lib/sports/soccer/queries";
import { getSoccerEngineStats } from "@/lib/scoring/stats";
import { BankoCard } from "@/components/soccer/BankoCard";
import { CouponCard } from "@/components/soccer/CouponCard";
import { MatchRow } from "@/components/soccer/MatchRow";
import { Hero } from "@/components/site/Hero";
import { PillarRow } from "@/components/site/PillarRow";
import { SectionHeading } from "@/components/site/SectionHeading";

export const dynamic = "force-dynamic";

// Gold wordmark accent — same treatment the NBA home uses on its section
// titles, so both sports read as one brand.
const GOLD = {
  background: "linear-gradient(180deg, #FFE066 0%, #FFB800 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
} as const;

export default async function FootballHome() {
  const today = todayIsoDate();
  const [matches, banko, coupons, stats] = await Promise.all([
    getMatchesByDates([today]),
    getBankoPicks(),
    getEngineCoupons(),
    getSoccerEngineStats(),
  ]);

  const topBanko = banko.slice(0, 3);
  const headlineCoupons = coupons
    .filter((c) => c.target_multiplier !== null || c.kind === "surprise")
    .slice(0, 3);

  return (
    <div className="fade-up">
      <Hero
        stats={stats}
        eyebrow="World Cup · Football"
        subtitle="De-vigged consensus across every book, nudged by table form. Real prices, real expected value — every pick graded after the final whistle."
        primaryCta={{ href: "/football/picks", label: "Get Today's Picks" }}
        secondaryCta={{ href: "/football/scoreboard", label: "View Scoreboard" }}
      />

      {topBanko.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <SectionHeading
            eyebrow="World Cup · Locks"
            title={
              <>
                🔒 Most <span style={GOLD}>Trusted</span>
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
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <SectionHeading
            eyebrow="World Cup · Parlays"
            title={
              <>
                Double · Triple · <span style={GOLD}>10× Your Money</span>
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

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        <SectionHeading
          eyebrow="World Cup · Today"
          title={
            <>
              Today&apos;s <span style={GOLD}>Matches</span>
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
        {matches.length > 0 ? (
          <div className="space-y-2">
            {matches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-8 text-center text-sm text-foreground/55">
            No matches scheduled today. Check the{" "}
            <Link href="/football/schedule" className="text-primary font-semibold">
              schedule
            </Link>
            .
          </p>
        )}
      </section>

      <PillarRow />
    </div>
  );
}
