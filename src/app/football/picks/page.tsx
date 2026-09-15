import Link from "next/link";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import {
  getBankoPicks,
  getEngineCoupons,
  getRecentSettledPicks,
} from "@/lib/sports/soccer/queries";
import { BankoCard } from "@/components/soccer/BankoCard";
import { CouponCard } from "@/components/soccer/CouponCard";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { SettledPickRow } from "@/components/soccer/SettledPickRow";

export const dynamic = "force-dynamic";

export default async function PicksPage() {
  const competition = await activeCompetition();
  const meta = COMPETITIONS[competition];
  const [banko, coupons, recent] = await Promise.all([
    getBankoPicks(competition),
    getEngineCoupons(competition),
    getRecentSettledPicks(competition, 10),
  ]);

  const multipliers = coupons.filter((c) => c.kind === "multiplier");
  const surprise = coupons.find((c) => c.kind === "surprise");

  const empty = banko.length === 0 && coupons.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
      <div>
        <FootballHeader title="Engine Picks" competition={competition} />
        <p className="mt-2 text-sm text-foreground/55">
          De-vigged consensus across bookmakers, nudged by table form.
          {meta.status === "archived" ? " The tournament is over — this is the graded record." : ""}
        </p>
      </div>

      {empty ? (
        <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-12 text-center text-sm text-foreground/55">
          {meta.status === "archived"
            ? "No open picks — every pick from the tournament has been graded."
            : meta.oddsKey === null
              ? "No bookmaker odds for this competition yet — the engine needs a priced market to make a pick."
              : "No picks yet for the next matchday. The engine generates them once odds are in — usually the day before kickoff."}
        </p>
      ) : null}

      {banko.length > 0 ? (
        <section className="space-y-4">
          <h2 className="font-display text-2xl uppercase tracking-tight">🔒 BANKO — Most Trusted</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {banko.map((p) => (
              <BankoCard key={p.id} pick={p} />
            ))}
          </div>
        </section>
      ) : null}

      {multipliers.length > 0 ? (
        <section className="space-y-4">
          <h2 className="font-display text-2xl uppercase tracking-tight">Money Multipliers</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {multipliers.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        </section>
      ) : null}

      {surprise ? (
        <section className="space-y-4">
          <h2 className="font-display text-2xl uppercase tracking-tight">🎁 Surprise Coupon</h2>
          <div className="max-w-md">
            <CouponCard coupon={surprise} />
          </div>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl uppercase tracking-tight">Recently graded</h2>
            <Link
              href="/football/scoreboard"
              className="inline-block py-1 -my-1 text-sm font-semibold text-primary hover:text-primary-hover"
            >
              Full ledger →
            </Link>
          </div>
          <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/60 bg-card/40">
            {recent.map((p) => (
              <SettledPickRow key={p.id} pick={p} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
