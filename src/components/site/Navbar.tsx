import { LogoLink } from "@/components/site/LogoLink";
import { NavLinks } from "@/components/site/NavLinks";
import { MobileNav } from "@/components/MobileNav";
import { IdentityBadge } from "@/components/auth/IdentityBadge";
import { SportToggle } from "@/components/sports/SportToggle";
import { SPORTS } from "@/lib/sports/registry";
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
}: {
  identity: IdentityLite;
  sport: Sport;
  /** Football's active competition (the toggle knob shows its logo). */
  competitionLogo?: string;
  competitionLabel?: string;
}) {
  const navItems = SPORTS[sport].nav;
  // The desktop link row only fits once there's room for every item. Soccer
  // (few items) clears that bar at lg; the NBA's longer nav needs xl. Below the
  // threshold the hamburger carries navigation. All three nav surfaces share
  // this flag so the handoff happens at one breakpoint with no dead zone.
  const dense = navItems.length > 6;
  // Football's nav (11 items with Bracket + Value) doesn't fit until 2xl;
  // below that the hamburger carries it. All three surfaces share the tier.
  const ultra = navItems.length > 9;
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

        <NavLinks items={navItems} dense={dense} ultra={ultra} />

        <div className="flex items-center gap-2">
          <SportToggle
            active={sport}
            competitionLogo={competitionLogo}
            competitionLabel={competitionLabel}
          />
          <IdentityBadge dense={dense} ultra={ultra} />
          <MobileNav
            items={navItems}
            dense={dense}
            ultra={ultra}
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
