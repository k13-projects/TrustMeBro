import Link from "next/link";
import { cx } from "@/lib/design/tokens";

// URL-driven filters: plain links, server-side filtering, so a filtered board
// can be bookmarked or pasted to someone and works with JavaScript off.
export type FilterOption = { key: string; label: string };
export type FilterGroup = {
  param: string;
  label: string;
  options: FilterOption[];
  active: string;
};

function href(
  base: string,
  params: Record<string, string>,
  param: string,
  value: string,
): string {
  const next = { ...params, [param]: value };
  const qs = Object.entries(next)
    .filter(([, v]) => v && v !== "all")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

export function FilterBar({
  base,
  params,
  groups,
  summary,
}: {
  base: string;
  params: Record<string, string>;
  groups: FilterGroup[];
  /** What the current filters produced, in words. */
  summary: string;
}) {
  const anyActive = groups.some((g) => g.active !== "all");
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.param} className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/35">
            {group.label}
          </span>
          {group.options.map((o) => {
            const on = group.active === o.key;
            return (
              <Link
                key={o.key}
                href={href(base, params, group.param, o.key)}
                aria-current={on ? "true" : undefined}
                scroll={false}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/70 bg-black/25 text-foreground/70 hover:border-primary/50 hover:text-foreground",
                )}
              >
                {o.label}
              </Link>
            );
          })}
        </div>
      ))}
      <p className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
        <span>{summary}</span>
        {anyActive ? (
          <Link href={base} scroll={false} className="font-semibold text-primary">
            Clear filters
          </Link>
        ) : null}
      </p>
    </div>
  );
}
