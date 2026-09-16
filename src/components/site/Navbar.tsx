import { LogoLink } from "@/components/site/LogoLink";
import { NavLinks } from "@/components/site/NavLinks";
import { MobileNav } from "@/components/MobileNav";
import { IdentityBadge } from "@/components/auth/IdentityBadge";
import { SportToggle } from "@/components/sports/SportToggle";
import { SearchTrigger } from "@/components/soccer/SearchTrigger";
import { navForSport, NAV_TIER, SPORTS } from "@/lib/sports/registry";
import type { Sport } from "@/lib/sports/types";

type IdentityLite = {
  kind: "auth" | "guest";
  display_name: string | null;
} | null;

export function Navbar({
  identity,
  sport,
  competitionLogo,
  competitionLabel,
  hasBracket,
}: {
  identity: IdentityLite;
  sport: Sport;
  /** Football's active competition (the toggle knob shows its logo). */
  competitionLogo?: string;
  competitionLabel?: string;
  /** False for a single-table competition, which has no bracket to show. */
  hasBracket?: boolean;
}) {
  const navItems = navForSport(sport, { hasBracket });
  // Which width this sport's link row needs is declared and measured on the
  // sport itself (registry.ts), not inferred from how many entries it has —
  // a count is not a width, and inferring it clipped the sign-in button at
  // 1024px the day football gained a sixth group. All three nav surfaces read
  // the same tier, so the hamburger hands over at exactly one breakpoint.
  const tier = NAV_TIER[SPORTS[sport].navTier];
  return (
    <header className="sticky top-0 z-30">
      <div
        aria-hidden
        className="absolute inset-0 bg-background/92 supports-backdrop-filter:bg-background/75 supports-backdrop-filter:backdrop-blur-md border-b border-border/70 -z-10"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent -z-10"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* LogoLink is a tiny client island that adds back-to-top scroll when
            the logo is clicked on /. Everything else (the hover blur, the
            logo-float keyframe) is identical to the previous inline render. */}
        <LogoLink />

        <NavLinks items={navItems} rowClass={tier.row} />

        <div className="flex items-center gap-2">
          <SearchTrigger />
          <SportToggle
            active={sport}
            competitionLogo={competitionLogo}
            competitionLabel={competitionLabel}
          />
          <IdentityBadge inlineClass={tier.inline} rowClass={tier.row} />
          <MobileNav
            items={navItems}
            belowClass={tier.below}
            identity={
              identity
                ? {
                    kind: identity.kind,
                    display_name: identity.display_name ?? "",
                  }
                : undefined
            }
          />
        </div>
      </div>
    </header>
  );
}
