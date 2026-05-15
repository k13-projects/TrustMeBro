"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "nav-pill relative isolate rounded-full px-4 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
          : "nav-pill relative isolate rounded-full px-4 py-2 text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
      }
    >
      {children}
    </Link>
  );
}
