/**
 * Feature flags — single source of truth.
 *
 * Toggle a flag here (or via env var) to enable/disable a feature without
 * deleting code, components, or assets. Disabled features stay in the repo
 * so we can flip the flag back on instantly.
 */

/**
 * Paywall / VIP subscription gating.
 *
 * When `false` (default): every pick is visible to every visitor — no
 * "Unlock Pick" CTAs, no lock icons, no `<PricingTiers />` section on the
 * homepage. PickCard, PricingTiers, HandArrow and the Lock visuals all
 * remain in the codebase, just dormant.
 *
 * When `true`: signed-out visitors see only the first pick as free; the
 * rest are locked behind /login, and the pricing tiers section renders at
 * the bottom of the homepage.
 *
 * Flip via env without redeploying code:
 *   NEXT_PUBLIC_PAYWALL_ENABLED=true
 */
export const PAYWALL_ENABLED =
  process.env.NEXT_PUBLIC_PAYWALL_ENABLED === "true";
