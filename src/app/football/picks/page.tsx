import { getBankoPicks, getEngineCoupons } from "@/lib/sports/soccer/queries";
import { BankoCard } from "@/components/soccer/BankoCard";
import { CouponCard } from "@/components/soccer/CouponCard";

export const dynamic = "force-dynamic";

export default async function PicksPage() {
  const [banko, coupons] = await Promise.all([
    getBankoPicks(),
    getEngineCoupons(),
  ]);

  const multipliers = coupons.filter((c) => c.kind === "multiplier");
  const surprise = coupons.find((c) => c.kind === "surprise");

  const empty = banko.length === 0 && coupons.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          ⚽ World Cup
        </p>
        <h1 className="mt-1 text-3xl font-black">Engine Picks</h1>
        <p className="mt-1 text-sm text-foreground/55">
          De-vigged consensus across bookmakers, nudged by table form.
        </p>
      </header>

      {empty ? (
        <p className="rounded-2xl border border-border/60 bg-card/40 px-4 py-12 text-center text-sm text-foreground/55">
          No picks yet. The engine generates them once odds are in for the slate.
        </p>
      ) : null}

      {banko.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-black">🔒 BANKO — Most Trusted</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {banko.map((p) => (
              <BankoCard key={p.id} pick={p} />
            ))}
          </div>
        </section>
      ) : null}

      {multipliers.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-black">Money Multipliers</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {multipliers.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        </section>
      ) : null}

      {surprise ? (
        <section className="space-y-4">
          <h2 className="text-xl font-black">🎁 Surprise Coupon</h2>
          <div className="max-w-md">
            <CouponCard coupon={surprise} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
