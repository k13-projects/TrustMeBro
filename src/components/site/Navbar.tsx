import Link from "next/link";
import Image from "next/image";
import { MagneticLink } from "@/components/site/MagneticLink";
import { NavLinks } from "@/components/site/NavLinks";
import { MobileNav } from "@/components/MobileNav";
import { IdentityBadge } from "@/components/auth/IdentityBadge";

const NAV_ITEMS = [
  { href: "/", label: "Home", exact: true },
  { href: "/#picks", label: "Picks" },
  { href: "/games", label: "Games" },
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
        className="absolute inset-0 backdrop-blur-2xl bg-background/65 border-b border-border/70 -z-10"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent -z-10"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="group flex items-center gap-3"
          aria-label="TrustMeBro home"
        >
          <MagneticLink strength={0.18} className="relative">
            <span
              aria-hidden
              className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl opacity-0 group-hover:opacity-80 transition-opacity duration-500"
            />
            <Image
              src="/Design/Logo 2.png"
              alt="TrustMeBro"
              width={84}
              height={84}
              priority
              className="relative rounded-2xl logo-float transition-transform duration-300 ease-out group-hover:rotate-[-5deg] group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:transform-none motion-reduce:animate-none"
              style={{ mixBlendMode: "screen" }}
            />
          </MagneticLink>
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
