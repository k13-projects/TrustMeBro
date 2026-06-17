# UI Renovation Plan

Generated 2026-05-15 from stakeholder mockups in `public/Design/Design Vision 1-4.jpeg` + logos.

## Aesthetic direction — LOCKED

**Dark sports-streetwear betting platform.** Pitch-black canvas, bright Lakers-gold accents, bold italic display type, mascot-driven hero. Vegas energy + streetwear confidence. Avoid generic AI/SaaS aesthetics.

### Mockup signals (consistent across all 4 visions)
- Black background, yellow `#FFB800`-ish primary, white headlines
- Yellow smiley mascot in cap (logo.png) is THE differentiator — must appear in hero
- Heavy italic display font for "IN DATA / WE TRUST / ME BRO" with brush-stroke under "BRO"
- Stat blocks with yellow numerics: WIN RATE / ROI / STREAK / UNITS
- Dark elevated cards with subtle borders, lock icons for premium picks
- 4-pillar trust strip: DATA DRIVEN · SHARP ANALYSIS · PROVEN RESULTS · COMMUNITY FIRST
- Pricing: $19/week vs $49/month, monthly tagged "MOST POPULAR" in yellow
- Footer: mascot wordmark left, columns center, socials right

### Tailwind v4 tokens (replace globals.css)
```css
:root {
  --background: #0a0a0c;
  --surface: #15151a;
  --surface-2: #1d1d24;
  --foreground: #f7f7fa;
  --muted: #8b8b94;
  --primary: #FFB800;          /* TrustMeBro gold — PRIMARY ACTION */
  --primary-hover: #FFC929;
  --accent-fire: #FF6B35;       /* streaks, hot picks */
  --success: #10b981;            /* positive deltas only */
  --danger: #ef4444;
  --border: rgba(255,255,255,0.08);
}
```

### Typography
- **Display**: Anton (Google Fonts) — bold italic condensed for headlines
- **Sub-display**: Archivo Black for stat numerals
- **Body**: Geist Sans (already in project) or Manrope
- **Brush accent**: Permanent Marker or hand-drawn SVG underline
- **NEVER**: Inter, Roboto, Arial, generic system fonts

### Iconography
- `lucide-react` for stock icons (Lock, TrendingUp, Flame, Trophy, Shield)
- `/public/Design/logo.png` — full mascot (hero)
- `/public/Design/Logo 2.png` — wordmark badge (footer)

## Conflict with CLAUDE.md — STAKEHOLDER DECISION NEEDED

CLAUDE.md currently states (Dashboard Conventions):
> "Robinhood-style: emerald/green for primary action"

New mockup makes **YELLOW** the primary action. Resolution proposed:
- Primary CTA color: **YELLOW** (matches mockup)
- Keep emerald `#10b981` only for positive-delta indicators (win streak, ROI up arrow, last-10 average — the data viz semantics)
- Update CLAUDE.md Dashboard Conventions section to reflect this split

Purple/fuchsia/violet/indigo: **STILL BANNED.** No conflict.

## Pages to renovate (priority)

| # | Route | Source files | Notes |
|---|-------|--------------|-------|
| 1 | `/` | `app/page.tsx` | Full hero + sections per mockup |
| 2 | layout | `app/layout.tsx` | New nav + footer + theme baseline |
| 3 | `/players/[id]` | `app/players/[id]/page.tsx` | Restyle, keep data |
| 4 | `/games/[id]` | `app/games/[id]/page.tsx` | Restyle |
| 5 | `/teams/[id]` | `app/teams/[id]/page.tsx` | Restyle |
| 6 | `/score` | `app/score/page.tsx` | Chart palette swap |
| 7 | `/history` | `app/history/page.tsx` | Restyle |
| 8 | `/login` | `app/login/page.tsx` | Yellow CTA, dark glass card |
| 9 | `/auth/callback` | `app/auth/callback/page.tsx` | Minimal restyle |
| 10 | index pages | `players`, `games`, `teams`, `engine` | List/grid restyle |

## New components to build

In `src/components/site/`:
- `Navbar.tsx` — logo + nav links (yellow-underline hover, active state) + Login + JOIN NOW CTA
- `Footer.tsx` — mascot wordmark + 4-column nav + socials row
- `Hero.tsx` — mascot image + "IN DATA WE TRUST ME BRO" headline + stat panel (WIN RATE / ROI / STREAK / UNITS) + 2 CTAs + member avatars
- `StatStrip.tsx` — 4-up trust pillar row (10,000+ Picks / 7+ Years / 65% Win Rate / 20,000+ Units)
- `TopPicksGrid.tsx` — 3-up + free pick variant (locked card with login overlay)
- `PillarRow.tsx` — DATA DRIVEN · SHARP ANALYSIS · PROVEN RESULTS · COMMUNITY FIRST (separators + icons)
- `WinnersClub.tsx` — Discord/Telegram join card + testimonial trio
- `PricingTiers.tsx` — weekly + monthly with MOST POPULAR yellow tag
- `UnlockEdgeCta.tsx` — "STOP GUESSING. START WINNING." closer
- `Mascot.tsx` — wrapped `next/image` with float animation

## Animation plan (motion library)

Use `motion` (the successor to Framer Motion, React 19 compatible).

| Element | Effect |
|---------|--------|
| Hero headline | Staggered word reveal on mount, 80ms delay each |
| Mascot | Subtle y-axis bob (4px) on infinite loop, 3s |
| "BRO" wordmark | SVG brush-stroke draw on viewport-enter (path animation) |
| Stat numerals | Count-up animation on `useInView` (0 → target over 1.2s) |
| Nav links | Yellow underline draw left→right on hover (200ms) |
| Pick cards | translateY -4px + box-shadow grow + border yellow glow on hover |
| CTA buttons | Gold shimmer sweep on hover (gradient mask animation) |
| Premium lock icon | Wiggle on card hover |
| Page entry | Fade + 8px slide up, staggered for sections |
| Trust strip | Continuous horizontal marquee (no JS — pure CSS keyframe) |
| Pricing card "MOST POPULAR" | Subtle pulse glow |

## Setup steps (POST-RESTART, run in order)

```bash
# 1. Initialize shadcn (Tailwind v4, lucide, Next App Router)
cd /Users/k13/Desktop/PROJECTS/TrustMeBro
npx shadcn@latest init --defaults  # or: --preset nova

# 2. Install motion + icon deps (use packageManager from package.json)
pnpm add motion lucide-react clsx tailwind-merge class-variance-authority
# (or npm/yarn equivalent)

# 3. Add core shadcn primitives
npx shadcn@latest add button card badge separator dialog sheet tabs avatar tooltip skeleton sonner

# 4. SHADCNBLOCKS_API_KEY needed for shadcnblocks/* installs
#    Without it, build sections by composing shadcn primitives + custom code.

# 5. Add Google Fonts via next/font/google in app/layout.tsx:
#    Anton (display), Archivo_Black (numerals), Permanent_Marker (accent)

# 6. Rewrite globals.css with new tokens (replace emerald radials)

# 7. Build site components in this order:
#    Navbar → Footer → Hero → StatStrip → TopPicksGrid → PillarRow → WinnersClub → PricingTiers → UnlockEdgeCta

# 8. Rewrite app/page.tsx to compose the sections

# 9. Migrate existing components/ui/* (Button, Card, Badge, Input) to shadcn primitives

# 10. Renovate inner pages one by one (priority list above)

# 11. webapp-testing: install Python Playwright, screenshot home, diff against mockup
#     pip install playwright && playwright install chromium
#     python ~/.claude/skills/webapp-testing/scripts/with_server.py --help
```

## Skill invocation order

1. **`frontend-design`** — already a plugin, auto-activates for UI work. Bedrock aesthetic skill.
2. **`shadcn`** — auto-activates after `components.json` exists. Reads project context, enforces patterns.
3. **`Shadcn UI & Blocks`** — selectively for hero/pricing/testimonial blocks IF user provides `SHADCNBLOCKS_API_KEY`.
4. **`webapp-testing`** — once dev server runs, screenshot + diff against `public/Design/*.jpeg`.
5. **`theme-factory`** — SKIPPED. Its 10 presets (Ocean Depths, Sunset Boulevard, etc.) don't fit the streetwear-sports brief. Custom inline theme above is purpose-built.

## Files that will be removed/replaced

- `src/components/ui/{Card,Badge,Button,Input}.tsx` → replaced by shadcn-generated equivalents under same paths or `src/components/ui/` per shadcn config
- `src/app/globals.css` body radial gradients → swapped from emerald → subtle gold/black grain texture

## Verification checklist (per page)

- [ ] Matches mockup spacing/hierarchy at 1280px width
- [ ] Mobile responsive (single column at <768px)
- [ ] All animations trigger correctly (hero, scroll, hover)
- [ ] No purple/fuchsia/violet/indigo anywhere
- [ ] Lighthouse a11y >= 95
- [ ] Lighthouse perf >= 85
- [ ] Playwright screenshot looks like mockup
