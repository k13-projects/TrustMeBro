"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cx, focusRing } from "@/lib/design/tokens";
import { isNavGroup, type NavEntry, type NavItem } from "@/lib/sports/registry";

// Next.js `usePathname()` doesn't include the hash, so items like
// `/#picks` never matched. We track `window.location.hash` separately.
//
// Why so many listeners: Next.js's client navigation to a same-route hash
// (clicking `<Link href="/#picks" />` while already on `/`) updates the URL
// via History.replaceState/pushState but doesn't reliably fire a
// `hashchange` event in every code path. Listening on click (capture phase)
// plus `popstate` covers back/forward and direct anchor clicks alike. The
// requestAnimationFrame defer makes sure the URL has actually been updated
// by the time we read it.
function useUrlHash() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    const syncSoon = () => requestAnimationFrame(sync);
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    document.addEventListener("click", syncSoon, true);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
      document.removeEventListener("click", syncSoon, true);
    };
  }, []);
  return hash;
}

function isItemActive(item: NavItem, pathname: string, urlHash: string): boolean {
  const [rawPath, fragment] = item.href.split("#");
  const itemPath = rawPath || "/";
  const itemHash = fragment ? `#${fragment}` : "";
  if (itemHash) return pathname === itemPath && urlHash === itemHash;
  if (item.exact) return pathname === itemPath && !urlHash;
  return itemPath !== "/" && pathname.startsWith(itemPath);
}

const linkClass =
  "relative inline-flex items-center whitespace-nowrap px-3 py-2 text-[12.5px] font-semibold uppercase tracking-[0.12em] transition-colors duration-200";

export function NavLinks({
  items,
  dense = false,
}: {
  items: ReadonlyArray<NavEntry>;
  dense?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const urlHash = useUrlHash();
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  return (
    <div
      className={cx(dense ? "hidden xl:flex" : "hidden lg:flex", "items-center")}
      onMouseLeave={() => setHoverKey(null)}
    >
      <nav className="relative flex items-center gap-0.5" aria-label="Primary">
        {items.map((entry) =>
          isNavGroup(entry) ? (
            <NavGroupMenu
              key={entry.label}
              group={entry}
              pathname={pathname}
              urlHash={urlHash}
              hovered={hoverKey === entry.label}
              onHover={setHoverKey}
            />
          ) : (
            <NavSingleLink
              key={entry.label}
              item={entry}
              pathname={pathname}
              urlHash={urlHash}
              hovered={hoverKey === entry.label}
              onHover={setHoverKey}
            />
          ),
        )}
      </nav>
    </div>
  );
}

function HoverPill({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.span
          layoutId="nav-hover-pill"
          className="pointer-events-none absolute inset-0 rounded-full bg-primary/10 ring-1 ring-primary/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        />
      ) : null}
    </AnimatePresence>
  );
}

function NavSingleLink({
  item,
  pathname,
  urlHash,
  hovered,
  onHover,
}: {
  item: NavItem;
  pathname: string;
  urlHash: string;
  hovered: boolean;
  onHover: (key: string | null) => void;
}) {
  const isActive = isItemActive(item, pathname, urlHash);
  const [rawPath, fragment] = item.href.split("#");
  const itemPath = rawPath || "/";
  const itemHash = fragment ? `#${fragment}` : "";

  return (
    <div className="relative" onMouseEnter={() => onHover(item.label)}>
      <HoverPill show={hovered} />
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        onClick={(e) => {
          // Same-page navigation: do the scroll + active state ourselves.
          // Next's Link hash handling is racy on the FIRST click.
          if (pathname !== itemPath) return;
          if (itemHash) {
            const el = document.getElementById(itemHash.slice(1));
            if (!el) return;
            e.preventDefault();
            window.history.pushState(null, "", item.href);
            window.dispatchEvent(new Event("hashchange"));
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          } else if (item.exact) {
            e.preventDefault();
            window.history.pushState(null, "", itemPath);
            window.dispatchEvent(new Event("hashchange"));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
        className={cx(
          linkClass,
          isActive ? "text-primary" : "text-foreground/72 hover:text-foreground",
          focusRing,
          "rounded-full",
        )}
      >
        {item.label}
        {isActive ? (
          <motion.span
            layoutId="nav-active-dot"
            className="ml-1.5 size-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(255,184,0,0.7)]"
          />
        ) : null}
      </Link>
    </div>
  );
}

// A nav group: a button that opens a small menu. Opens on hover after a beat
// and on click, closes on Escape, outside click, route change or blur out.
// Arrow keys move through the items, so it is usable without a mouse.
function NavGroupMenu({
  group,
  pathname,
  urlHash,
  hovered,
  onHover,
}: {
  group: { label: string; items: NavItem[] };
  pathname: string;
  urlHash: string;
  hovered: boolean;
  onHover: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChild = group.items.some((i) => isItemActive(i, pathname, urlHash));

  const close = useCallback(() => {
    setOpen(false);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  // Close on navigation without flagging a setState-in-effect loop.
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  function focusItem(index: number) {
    const nodes = wrapRef.current?.querySelectorAll<HTMLAnchorElement>("[data-menu-item]");
    if (!nodes || nodes.length === 0) return;
    const i = (index + nodes.length) % nodes.length;
    nodes[i].focus();
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => {
        onHover(group.label);
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setOpen(true), 120);
      }}
      onMouseLeave={() => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        hoverTimer.current = setTimeout(() => setOpen(false), 180);
      }}
    >
      <HoverPill show={hovered} />
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusItem(0));
          }
        }}
        className={cx(
          linkClass,
          "gap-1 rounded-full",
          activeChild ? "text-primary" : "text-foreground/72 hover:text-foreground",
          focusRing,
        )}
      >
        {group.label}
        <ChevronDown
          size={13}
          aria-hidden
          className={cx("transition-transform duration-200", open && "rotate-180")}
        />
        {activeChild ? (
          <motion.span
            layoutId="nav-active-dot"
            className="ml-0.5 size-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(255,184,0,0.7)]"
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={group.label}
          className="absolute left-0 top-full z-40 mt-1 w-52 rounded-2xl border border-white/10 bg-[#0b0d14] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        >
          {group.items.map((item, i) => {
            const active = isItemActive(item, pathname, urlHash);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                data-menu-item
                aria-current={active ? "page" : undefined}
                onClick={close}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    focusItem(i + 1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    focusItem(i - 1);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    focusItem(0);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    focusItem(group.items.length - 1);
                  }
                }}
                className={cx(
                  "block rounded-xl px-3 py-2 text-[12.5px] font-semibold uppercase tracking-[0.1em] transition-colors",
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-foreground/75 hover:bg-white/6 hover:text-foreground",
                  focusRing,
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
