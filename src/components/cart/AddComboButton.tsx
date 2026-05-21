"use client";

import { useState } from "react";
import { cx, focusRing } from "@/lib/design/tokens";
import { useCart, type CartPick } from "./CartContext";

/**
 * Adds an entire combo (2 or 3 picks) to the coupon in one click. Replaces
 * whatever was in the cart so the user lands on the curated combo cleanly
 * — building a 3-pick combo on top of an existing partial cart would
 * usually hit the same-game guard and the 6-pick cap and present worse UX
 * than just resetting.
 */
export function AddComboButton({
  picks,
  label = "Add combo to coupon",
}: {
  picks: CartPick[];
  label?: string;
}) {
  const cart = useCart();
  const [flash, setFlash] = useState<string | null>(null);
  const allInCart =
    picks.length > 0 && picks.every((p) => cart.has(p.prediction_id));
  const disabled = !cart.hydrated;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!cart.hydrated) return;
    cart.clear();
    let added = 0;
    for (const p of picks) {
      const res = cart.add(p);
      if (res.ok) added += 1;
    }
    if (added < picks.length) {
      setFlash(`Added ${added} of ${picks.length}`);
      window.setTimeout(() => setFlash(null), 1800);
    }
    cart.open();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={label}
      className={cx(
        // Same gold-outline family as AddToCouponButton — unified look.
        "inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        allInCart
          ? "border-amber-400/30 bg-amber-400/15 text-amber-300 hover:bg-amber-400/20"
          : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/60",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        focusRing,
      )}
    >
      {flash ? (
        <span aria-live="polite">{flash}</span>
      ) : allInCart ? (
        "✓ In coupon"
      ) : (
        <>+ {label}</>
      )}
    </button>
  );
}
