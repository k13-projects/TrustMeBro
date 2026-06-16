import Link from "next/link";
import { todayIsoDate } from "@/lib/date";
import {
  getBankoPicks,
  getEngineCoupons,
  getMatchesByDates,
} from "@/lib/sports/soccer/queries";
import { BankoCard } from "@/components/soccer/BankoCard";
import { CouponCard } from "@/components/soccer/CouponCard";
import { MatchRow } from "@/components/soccer/MatchRow";

export const dynamic = "force-dynamic";

export default async function FootballHome() {
  const today = todayIsoDate();
  const [matches, banko, coupons] = await Promise.all([
    getMatchesByDates([today]),
    getBankoPicks(),
    getEngineCoupons(),
  ]);

  const topBanko = banko.slice(0, 2);
  const headlineCoupons = coupons
    .filter((c) => c.target_multiplier !== null || c.kind === "surprise")
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          ⚽ World Cup
        </p>
        <h1 className="mt-1 text-3xl font-black">Today&apos;s Football</h1>
      </header>

      {topBanko.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">🔒 BANKO — Most Trusted</h2>
            <Link href="/football/picks" className="text-sm font-semibold text-primary">
              All picks →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {topBanko.map((p) => (
              <BankoCard key={p.id} pick={p} />
            ))}
          </div>
        </section>
      ) : null}

      {headlineCoupons.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-black">Double · Triple · 10× Your Money</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {headlineCoupons.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black">Today&apos;s Matches</h2>
          <Link href="/football/schedule" className="text-sm font-semibold text-primary">
            Full schedule →
          </Link>
        </div>
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
    </div>
  );
}
