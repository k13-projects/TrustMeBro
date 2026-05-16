"use client";

import { cx, focusRing } from "@/lib/design/tokens";
import { useCart } from "./CartContext";

/**
 * Always-visible coupon pill — bottom-right, above the Ask AI launcher.
 * When empty: invites the user to start a coupon. When populated: shows
 * count. Hidden only when the drawer itself is open (don't double up the
 * affordance).
 */
export function CouponDrawerLauncher() {
  const cart = useCart();
  if (!cart.hydrated || cart.isOpen) return null;

  const empty = cart.picks.length === 0;
  const label = empty ? "Start a coupon" : "Coupon";
  const ariaLabel = empty
    ? "Open coupon builder (empty)"
    : `Open coupon (${cart.picks.length} picks)`;

  return (
    <button
      type="button"
      onClick={cart.open}
      aria-label={ariaLabel}
      className={cx(
        // Sits one slot above the ChatLauncher (bottom-6, h-12 + 1rem gap)
        // so the green "Ask AI" pill and the amber "Coupon" pill never
        // overlap when both are visible.
        "fixed bottom-20 right-5 z-40 inline-flex items-center gap-2 rounded-full glass-strong border border-amber-400/30 px-4 py-2 text-sm font-medium text-amber-300 shadow-[0_20px_40px_-12px_rgba(251,191,36,0.5)] hover:bg-amber-400/15 transition-colors",
        focusRing,
      )}
    >
      <span aria-hidden>🧾</span>
      <span>{label}</span>
      <span
        className={cx(
          "rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums",
          empty
            ? "bg-amber-400/10 text-amber-100/70"
            : "bg-amber-400/25 text-amber-100",
        )}
      >
        {cart.picks.length}
      </span>
    </button>
  );
}
