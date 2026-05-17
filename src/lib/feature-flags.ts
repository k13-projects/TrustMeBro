/**
 * Feature flags — single source of truth.
 *
 * Disabled features stay in the repo (PricingTiers.tsx, the `Lock` icon,
 * etc.) so we can flip a flag back on without restoring files from git.
 */

/**
 * Paywall / VIP subscription gating.
 *
 * Hardcoded to `false`. Intentionally NOT env-toggleable — a stale
 * NEXT_PUBLIC_PAYWALL_ENABLED=true on Vercel resurrected the locks site-wide
 * once already. Flip this constant to `true` to re-enable the paywall
 * (along with restoring the lock JSX in PickCard / Navbar / Hero, which was
 * hard-stripped — see `src/components/site/PricingTiers.tsx` for the
 * preserved pricing visuals).
 */
export const PAYWALL_ENABLED = false;
