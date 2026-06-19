"use client";

import Link from "next/link";
import { CountryFlag } from "@/components/soccer/CountryFlag";

export type NewsFilterTeam = {
  id: number;
  name: string;
  abbreviation: string;
  crest: string | null;
};

// Horizontally scrollable country strip. "All" (default) plus every team that
// currently has news. Selecting a country pushes ?team=<id>; the page reads it
// and filters server-side. Active pill goes gold.
export function NewsFilterBar({
  teams,
  activeTeam,
}: {
  teams: NewsFilterTeam[];
  activeTeam: number | null;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max items-center gap-2">
        <Pill href="/football/news" active={activeTeam === null}>
          <span className="text-sm font-semibold">All</span>
        </Pill>
        {teams.map((t) => (
          <Pill
            key={t.id}
            href={`/football/news?team=${t.id}`}
            active={activeTeam === t.id}
          >
            <CountryFlag crest={t.crest} abbr={t.abbreviation} name={t.name} size={16} />
            <span className="text-sm">{t.name}</span>
          </Pill>
        ))}
      </div>
    </div>
  );
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 transition-colors ${
        active
          ? "bg-primary text-black ring-primary"
          : "bg-foreground/5 text-foreground/85 ring-border hover:bg-foreground/10"
      }`}
    >
      {children}
    </Link>
  );
}
