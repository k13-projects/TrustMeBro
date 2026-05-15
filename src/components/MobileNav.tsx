"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx, focusRing } from "@/lib/design/tokens";

type Item = { href: string; label: string; exact?: boolean };

const ITEMS: Item[] = [
  { href: "/", label: "Picks", exact: true },
  { href: "/games", label: "Games" },
  { href: "/teams", label: "Teams" },
  { href: "/players", label: "Players" },
  { href: "/engine", label: "Engine" },
  { href: "/score", label: "Score" },
  { href: "/history", label: "History" },
];

type Identity =
  | { kind: "auth" | "guest"; display_name: string }
  | null;

export function MobileNav({ identity }: { identity?: Identity } = {}) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // Close drawer when navigating to a new route. We use the previous-pathname
  // ref + effect pattern so React doesn't flag this as a setState-in-effect.
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  return (
    <div ref={containerRef} className="sm:hidden relative">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "inline-flex items-center justify-center size-9 rounded-full bg-white/8 hover:bg-white/12 border border-white/10",
          focusRing,
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {open ? (
            <>
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </>
          ) : (
            <>
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </>
          )}
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-11 z-40 w-56 glass-strong rounded-2xl p-2 space-y-1 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        >
          {ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block rounded-xl px-3 py-2 text-sm",
                  active
                    ? "bg-white/12 text-foreground"
                    : "text-foreground/75 hover:bg-white/5 hover:text-foreground",
                  focusRing,
                )}
              >
                {item.label}
              </Link>
            );
          })}
          {identity ? (
            <form
              action="/api/auth/signout"
              method="post"
              className="border-t border-white/10 mt-1 pt-2 px-3 pb-1 space-y-1.5"
            >
              <div className="flex items-center gap-2 text-xs text-foreground/70">
                <span
                  className={`size-1.5 rounded-full ${identity.kind === "guest" ? "bg-amber-300" : "bg-emerald-400"}`}
                  aria-hidden
                />
                <span className="truncate">{identity.display_name}</span>
                {identity.kind === "guest" ? (
                  <span className="text-[10px] uppercase tracking-widest text-foreground/45">
                    Guest
                  </span>
                ) : null}
              </div>
              <button
                type="submit"
                className="w-full text-left rounded-xl px-3 py-2 text-sm text-foreground/75 hover:bg-white/5 hover:text-foreground transition-colors"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              role="menuitem"
              className="block border-t border-white/10 mt-1 pt-2 px-3 py-2 text-sm text-foreground/75 hover:bg-white/5 hover:text-foreground rounded-xl"
            >
              Sign in
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
