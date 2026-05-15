"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import { cx, focusRing } from "@/lib/design/tokens";
import { marketLabel } from "@/components/MarketLabel";
import { PickSideTag } from "@/components/PickSideTag";
import { useCart, combinedConfidence, type CartPick } from "./CartContext";
import type { PayoutMap } from "@/lib/analysis/payouts";

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<PayoutMap>);

function relativeTime(iso: string | null): string {
  if (!iso) return "rates not yet verified";
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || t === 0) return "rates not yet verified";
  const diff = Date.now() - t;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "verified today";
  const days = Math.floor(diff / day);
  if (days < 30) return `verified ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `verified ${months}mo ago`;
  return `verified ${Math.floor(months / 12)}y ago`;
}

export function CouponDrawer({ isSignedIn }: { isSignedIn: boolean }) {
  const cart = useCart();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: payouts } = useSWR<PayoutMap>(
    cart.isOpen ? "/api/payout-multipliers" : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!cart.isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cart.close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cart, cart.isOpen]);

  const n = cart.picks.length;
  const row = payouts?.byCount[n] ?? null;
  const power = row?.power_payout ?? null;
  const flex = row?.flex_payout ?? null;
  const activeMultiplier =
    cart.mode === "power" ? power : cart.mode === "flex" ? flex : null;
  const potential =
    activeMultiplier !== null ? cart.stake * activeMultiplier : null;
  const confidence = combinedConfidence(cart.picks);

  const canPower = n >= 2 && power !== null;
  const canFlex = n >= 3 && flex !== null;
  const canSubmit =
    cart.stake > 0 &&
    activeMultiplier !== null &&
    n >= 2 &&
    (cart.mode === "power" ? canPower : canFlex);

  async function onSave() {
    if (!isSignedIn) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!canSubmit || activeMultiplier === null || potential === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: cart.mode,
          stake: cart.stake,
          prediction_ids: cart.picks.map((p) => p.prediction_id),
          payout_multiplier: activeMultiplier,
          potential_payout: potential,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      cart.clear();
      cart.close();
      router.push("/history?tab=coupons");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {cart.isOpen ? (
        <button
          type="button"
          aria-label="Close coupon"
          onClick={cart.close}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_120ms_ease-out]"
        />
      ) : null}
      <aside
        role="dialog"
        aria-label="Coupon"
        aria-hidden={!cart.isOpen}
        className={cx(
          // Fully-opaque surface — the stake input and payout numbers need
          // to read clearly without the page bleeding through.
          "fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] glass-coupon border-l border-white/10 transition-transform duration-300 ease-out flex flex-col",
          cart.isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/8">
          <div>
            <p className="text-[10px] font-medium tracking-[0.22em] uppercase text-foreground/55">
              Coupon
            </p>
            <h2 className="text-lg font-semibold mt-0.5">
              {n === 0 ? "Empty" : `${n}-pick combo`}
            </h2>
          </div>
          <button
            type="button"
            onClick={cart.close}
            aria-label="Close coupon"
            className={cx(
              "size-9 inline-flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/10",
              focusRing,
            )}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {n === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/12 p-8 text-center text-sm text-foreground/55">
              <p>Tap <span className="font-mono text-amber-300">+ Coupon</span> on any pick to start building.</p>
              <p className="mt-2 text-xs">2–6 picks, one per game.</p>
            </div>
          ) : (
            cart.picks.map((p) => <DrawerPickRow key={p.prediction_id} pick={p} />)
          )}
        </div>

        <footer className="border-t border-white/8 px-5 py-4 space-y-3 bg-black/20">
          {n >= 2 ? (
            <>
              <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Mode">
                <ModeButton
                  active={cart.mode === "power"}
                  disabled={!canPower}
                  onClick={() => cart.setMode("power")}
                  label="Power"
                  multiplier={power}
                  hint="All picks hit"
                />
                <ModeButton
                  active={cart.mode === "flex"}
                  disabled={!canFlex}
                  onClick={() => cart.setMode("flex")}
                  label="Flex"
                  multiplier={flex}
                  hint={n < 3 ? "Needs 3+" : "Most hit (smaller)"}
                />
              </div>

              <label className="flex items-center gap-3 text-sm">
                <span className="text-foreground/65 text-[11px] uppercase tracking-widest min-w-[64px]">Stake</span>
                <div className="flex-1 flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                  <span className="text-foreground/55">$</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={cart.stake}
                    onChange={(e) => cart.setStake(Number(e.target.value))}
                    className="flex-1 bg-transparent outline-none font-mono tabular-nums"
                  />
                </div>
              </label>

              <div className="rounded-xl bg-white/3 border border-white/8 px-3 py-2.5 flex items-center justify-between text-sm">
                <span className="text-foreground/60">Potential payout</span>
                <span className="font-mono tabular-nums text-emerald-300 text-lg font-semibold">
                  {potential !== null ? `$${potential.toFixed(2)}` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-foreground/55">
                <span>Combined confidence (independence)</span>
                <span className="font-mono tabular-nums">{confidence.toFixed(1)}%</span>
              </div>

              <p className="text-[10px] leading-relaxed text-foreground/50">
                Multipliers mirror PrizePicks at last sync ({relativeTime(payouts?.latestVerifiedAt ?? null)}). Verify on PrizePicks before you enter.
              </p>

              {error ? (
                <p className="text-[11px] text-rose-300">{error}</p>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cart.clear}
                  className={cx(
                    "rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground/65 hover:bg-white/8",
                    focusRing,
                  )}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={submitting || !canSubmit}
                  className={cx(
                    "flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    canSubmit
                      ? "bg-amber-400/20 text-amber-200 border border-amber-400/30 hover:bg-amber-400/30"
                      : "bg-white/5 text-foreground/40 border border-white/10 cursor-not-allowed",
                    focusRing,
                  )}
                >
                  {submitting ? "Saving…" : isSignedIn ? "Save coupon" : "Sign in to save"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-foreground/55 text-center">
              Add at least 2 picks to see your payout.
            </p>
          )}
        </footer>
      </aside>
    </>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  label,
  multiplier,
  hint,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  multiplier: number | null;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "rounded-xl border px-3 py-2 text-left transition-colors",
        active
          ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
          : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/8",
        disabled ? "opacity-40 cursor-not-allowed" : "",
        focusRing,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="font-mono tabular-nums text-xs">
          {multiplier !== null ? `${multiplier}×` : "—"}
        </span>
      </div>
      <div className="text-[10px] uppercase tracking-widest opacity-70 mt-0.5">{hint}</div>
    </button>
  );
}

function DrawerPickRow({ pick }: { pick: CartPick }) {
  const cart = useCart();
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/3 border border-white/8 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">
            {pick.player_first_name} {pick.player_last_name}
          </span>
          {pick.team_abbreviation ? (
            <span className="text-[10px] font-mono uppercase text-foreground/55">
              {pick.team_abbreviation}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5 text-xs">
          <PickSideTag side={pick.pick} />
          <span className="font-mono tabular-nums">{pick.line}</span>
          <span className="text-foreground/55">{marketLabel(pick.market)}</span>
          <span className="text-foreground/40 font-mono tabular-nums ml-auto">{pick.confidence}%</span>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Remove ${pick.player_first_name} ${pick.player_last_name} from coupon`}
        onClick={() => cart.remove(pick.prediction_id)}
        className={cx(
          "shrink-0 size-7 inline-flex items-center justify-center rounded-full bg-white/5 hover:bg-rose-400/15 hover:text-rose-300 border border-white/10",
          focusRing,
        )}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
