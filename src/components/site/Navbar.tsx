import { LogoLink } from "@/components/site/LogoLink";
import { NavLinks } from "@/components/site/NavLinks";
import { MobileNav } from "@/components/MobileNav";
import { IdentityBadge } from "@/components/auth/IdentityBadge";

const NAV_ITEMS = [
  { href: "/", label: "Home", exact: true },
  { href: "/#picks", label: "Picks" },
  { href: "/games", label: "Games" },
  { href: "/results", label: "Results" },
  { href: "/news", label: "News" },
  { href: "/teams", label: "Teams" },
  { href: "/bros", label: "Bro Board" },
  { href: "/scorecard", label: "Scorecard" },
  { href: "/history", label: "History" },
] as const;

type IdentityLite = {
  kind: "auth" | "guest";
  display_name: string | null;
} | null;

export function Navbar({ identity }: { identity: IdentityLite }) {
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
        {/* LogoLink is a tiny client island that adds back-to-top scroll when
            the logo is clicked on /. Everything else (the hover blur, the
            logo-float keyframe) is identical to the previous inline render. */}
        <LogoLink />

        <NavLinks items={NAV_ITEMS} />

        <div className="flex items-center gap-2">
          <IdentityBadge />
          <MobileNav
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
