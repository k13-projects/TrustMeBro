import type { CouponView } from "@/lib/sports/soccer/queries";
import { PickLine } from "./PickLine";

function headline(coupon: CouponView): { badge: string; title: string; tone: string } {
  if (coupon.kind === "surprise") {
    return {
      badge: "🎁 SURPRISE",
      title: "Win Huge",
      tone: "from-amber-500/20 to-rose-500/10 border-amber-400/40",
    };
  }
  const x = coupon.target_multiplier ?? Math.round(coupon.combined_odds);
  return {
    badge: `${x}×`,
    title: `${x}× Your Money`,
    tone: "from-primary/20 to-primary/5 border-primary/40",
  };
}

export function CouponCard({ coupon }: { coupon: CouponView }) {
  const { badge, title, tone } = headline(coupon);
  const hitChance =
    coupon.combined_probability !== null
      ? Math.round(coupon.combined_probability * 100)
      : null;

  return (
    <div className={`rounded-3xl border bg-gradient-to-br ${tone} p-5`}>
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-background/60 px-3 py-1 text-sm font-black tracking-wide">
          {badge}
        </span>
        <span className="text-xs uppercase tracking-wide text-foreground/55">
          {coupon.legs.length} legs
        </span>
      </div>

      <h3 className="mt-3 text-xl font-black">{title}</h3>
      <div className="mt-1 flex items-baseline gap-3 text-sm">
        <span className="font-bold tabular-nums">
          {coupon.combined_odds.toFixed(2)}× payout
        </span>
        {hitChance !== null ? (
          <span className="text-foreground/55">~{hitChance}% hit chance</span>
        ) : null}
      </div>

      <div className="mt-3 divide-y divide-border/40 border-t border-border/40">
        {coupon.legs.map((leg) => (
          <PickLine key={leg.id} pick={leg} />
        ))}
      </div>
    </div>
  );
}
