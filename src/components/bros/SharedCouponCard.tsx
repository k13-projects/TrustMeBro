import Link from "next/link";
import { marketLabel } from "@/components/MarketLabel";
import { PickSideTag } from "@/components/PickSideTag";
import { TeamBadge } from "@/components/TeamBadge";
import type { TeamLite } from "@/components/types";
import { BroAvatar } from "./BroAvatar";
import type { SharedCoupon } from "@/lib/bros/types";

const OUTCOME_TONES = {
  pending: "bg-white/5 text-foreground/55 border-white/10",
  won: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
  lost: "bg-rose-400/15 text-rose-300 border-rose-400/30",
  void: "bg-white/5 text-foreground/55 border-white/10",
} as const;

export function SharedCouponCard({
  coupon,
  teamById,
  hideOwner = false,
}: {
  coupon: SharedCoupon;
  teamById: Map<number, TeamLite>;
  hideOwner?: boolean;
}) {
  const stake = Number(coupon.stake);
  const multiplier = Number(coupon.payout_multiplier);
  const potential = Number(coupon.potential_payout);
  const resultPayout =
    coupon.result_payout !== null ? Number(coupon.result_payout) : null;

  return (
    <article className="glass glass-sheen rounded-2xl p-4 space-y-3 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-30px_rgba(255,184,0,0.45)]">
      {hideOwner ? null : (
        <Link
          href={`/bros/${coupon.owner.handle}`}
          className="flex items-center gap-3 -mx-1 -mt-1 px-1 pt-1 rounded-xl hover:bg-white/4 transition-colors"
        >
          <BroAvatar
            handle={coupon.owner.handle}
            displayName={coupon.owner.display_name}
            avatarUrl={coupon.owner.avatar_url}
            size={36}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {coupon.owner.display_name}
            </div>
            <div className="text-[11px] text-foreground/55 font-mono">
              @{coupon.owner.handle}
              {coupon.shared_at ? (
                <span className="ml-2 text-foreground/45">
                  · {relativeShort(coupon.shared_at)}
                </span>
              ) : null}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium ${OUTCOME_TONES[coupon.status]}`}
          >
            {coupon.status === "void" ? "refunded" : coupon.status}
          </span>
        </Link>
      )}

      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/15 text-primary border border-primary/30 px-2.5 py-0.5 text-[10px] uppercase tracking-widest font-medium">
            {coupon.pick_count}-pick {coupon.mode}
          </span>
          <span className="text-[11px] text-foreground/45 font-mono tabular-nums">
            ${stake.toFixed(2)} × {multiplier}× → ${potential.toFixed(2)}
          </span>
        </div>
        {hideOwner ? (
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium ${OUTCOME_TONES[coupon.status]}`}
          >
            {coupon.status === "void" ? "refunded" : coupon.status}
          </span>
        ) : null}
      </header>

      <ul className="space-y-1.5">
        {coupon.picks.map((p) =>
          p.prediction && p.prediction.player ? (
            <li
              key={p.prediction.id}
              className="flex items-center gap-2 text-xs"
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-primary/70"
              />
              <span className="font-medium">
                {p.prediction.player.first_name}{" "}
                {p.prediction.player.last_name}
              </span>
              <TeamBadge
                team={
                  p.prediction.player.team_id != null
                    ? teamById.get(p.prediction.player.team_id) ?? null
                    : null
                }
                size={14}
              />
              <PickSideTag side={p.prediction.pick} />
              <span className="font-mono tabular-nums">
                {p.prediction.line}
              </span>
              <span className="text-foreground/55">
                {marketLabel(p.prediction.market)}
              </span>
            </li>
          ) : null,
        )}
      </ul>

      {resultPayout !== null ? (
        <footer className="text-xs text-foreground/65 font-mono tabular-nums border-t border-white/8 pt-2 flex items-center justify-between">
          <span className="uppercase tracking-widest text-[10px] text-foreground/45">
            Settled
          </span>
          <span>
            paid{" "}
            <span
              className={
                coupon.status === "won"
                  ? "text-emerald-300"
                  : coupon.status === "void"
                    ? "text-foreground/65"
                    : "text-rose-300"
              }
            >
              ${resultPayout.toFixed(2)}
            </span>
          </span>
        </footer>
      ) : null}
    </article>
  );
}

function relativeShort(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
