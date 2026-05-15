// Centralized design tokens for TrustMeBro.
// Use these instead of hardcoding bg-white/5, opacity, shadow values inline.
// Class strings are kept literal so Tailwind v4's JIT picks them up at build time.

export const surfaceTokens = {
  // Subtle backgrounds layered over the dark base.
  subtle: "bg-white/5",
  faint: "bg-white/8",
  raised: "bg-white/10",
  strong: "bg-white/15",
  // Borders / dividers
  border: "border-white/10",
  borderStrong: "border-white/15",
  divider: "divide-white/8",
} as const;

export const radiusTokens = {
  sm: "rounded-md",
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
  pill: "rounded-full",
} as const;

export const shadowTokens = {
  // Branded glow shadows. Keep one source of truth for the rose accent.
  glowRose: "shadow-[0_0_24px_rgba(244,63,94,0.45)]",
  glowRoseSm: "shadow-[0_0_16px_rgba(244,63,94,0.35)]",
  glowEmerald: "shadow-[0_0_30px_rgba(16,185,129,0.45)]",
  none: "shadow-none",
} as const;

// Outcome / status tones used by Badge, ConfidencePill, and settlement rows.
export const toneTokens = {
  emerald: {
    fg: "text-emerald-300",
    bg: "bg-emerald-400/15",
    border: "border-emerald-400/30",
  },
  amber: {
    fg: "text-amber-300",
    bg: "bg-amber-400/15",
    border: "border-amber-400/30",
  },
  rose: {
    fg: "text-rose-300",
    bg: "bg-rose-400/15",
    border: "border-rose-400/30",
  },
  sky: {
    fg: "text-sky-300",
    bg: "bg-sky-400/15",
    border: "border-sky-400/30",
  },
  neutral: {
    fg: "text-foreground/70",
    bg: "bg-white/8",
    border: "border-white/10",
  },
} as const;

export type Tone = keyof typeof toneTokens;

// Reusable focus ring. Apply to any interactive element to satisfy WCAG AA.
// The offset color matches the app's --background so the ring reads on every
// surface — including glass cards stacked on the radial gradient body.
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508]";

// Use when an element sits inside a glass surface and the offset-bg would clash.
export const focusRingInset =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

// Disabled state — used by Button, Input, PlayButton for consistency.
export const disabledStyles =
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";

// Small helper to compose class strings without pulling in a dependency.
// Falsy values are dropped; falsy includes undefined, null, false, "".
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
