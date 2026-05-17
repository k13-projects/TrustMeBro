import Link from "next/link";
import Image from "next/image";
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
        {/* Logo is now a plain server component link — MagneticLink wrapper was
            adding pointer-move + useSpring on every hover across every page,
            and mix-blend-mode: screen forced a compositor pass behind it. The
            logo-float CSS keyframe still gives the slow drift for free. */}
        <Link
          href="/"
          className="group relative flex items-center gap-3"
          aria-label="TrustMeBro home"
        >
          <span
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl opacity-0 group-hover:opacity-80 transition-opacity duration-500 pointer-events-none"
          />
          <Image
            src="/Design/Logo 2.png"
            alt="TrustMeBro"
            width={84}
            height={84}
            priority
            sizes="84px"
            className="relative rounded-2xl logo-float transition-transform duration-300 ease-out group-hover:rotate-[-5deg] group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:transform-none motion-reduce:animate-none"
          />
        </Link>

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
