"use client";

import { cx, focusRing } from "@/lib/design/tokens";
import { useCart } from "./CartContext";

export function CouponDrawerLauncher() {
  const cart = useCart();
  if (!cart.hydrated || cart.picks.length === 0 || cart.isOpen) return null;

  return (
    <button
      type="button"
      onClick={cart.open}
      aria-label={`Open coupon (${cart.picks.length} picks)`}
      className={cx(
        // Sits one slot above the ChatLauncher (bottom-6, h-12 + 1rem gap)
        // so the green "Ask AI" pill and the amber "Coupon" pill never
        // overlap when both are visible.
        "fixed bottom-20 right-5 z-40 inline-flex items-center gap-2 rounded-full glass-strong border border-amber-400/30 px-4 py-2 text-sm font-medium text-amber-300 shadow-[0_20px_40px_-12px_rgba(251,191,36,0.5)] hover:bg-amber-400/15 transition-colors",
        focusRing,
      )}
    >
      <span aria-hidden>🧾</span>
      <span>Coupon</span>
      <span className="rounded-full bg-amber-400/25 text-amber-100 px-2 py-0.5 text-[11px] font-mono tabular-nums">
        {cart.picks.length}
      </span>
    </button>
  );
}
