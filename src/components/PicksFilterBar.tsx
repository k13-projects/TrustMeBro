"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { cx, focusRing } from "@/lib/design/tokens";

type MarketOption = {
  value: string;
  label: string;
};

const MARKETS: MarketOption[] = [
  { value: "", label: "All markets" },
  { value: "points", label: "Points" },
  { value: "rebounds", label: "Rebounds" },
  { value: "assists", label: "Assists" },
  { value: "threes_made", label: "3PM" },
  { value: "pra", label: "PRA" },
  { value: "minutes", label: "Minutes" },
];

const CONFIDENCE_STEPS = [0, 60, 70, 75, 80, 85, 90] as const;

export function PicksFilterBar({
  totalCount,
  filteredCount,
}: {
  totalCount: number;
  filteredCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const market = params.get("market") ?? "";
  const minConfidence = Number(params.get("min") ?? "0");

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `/?${qs}` : "/", { scroll: false });
      });
    },
    [params, router],
  );

  const activeFilters = (market ? 1 : 0) + (minConfidence > 0 ? 1 : 0);
  const filtersOn = activeFilters > 0;

  return (
    <div
      className={cx(
        "glass rounded-2xl p-3 sm:p-4 space-y-3 transition-opacity",
        isPending && "opacity-70",
      )}
      aria-busy={isPending || undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-foreground/45 mr-1">
          Market
        </span>
        {MARKETS.map((m) => {
          const active = market === m.value;
          return (
            <button
              key={m.value || "all"}
              type="button"
              onClick={() => updateParam("market", m.value || null)}
              aria-pressed={active}
              className={cx(
                "rounded-full px-3 py-1 text-xs transition-colors",
                focusRing,
                active
                  ? "bg-white/15 text-foreground border border-white/20"
                  : "bg-white/5 text-foreground/70 hover:bg-white/8 border border-white/10",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-foreground/45 mr-1">
          Min confidence
        </span>
        {CONFIDENCE_STEPS.map((step) => {
          const active = minConfidence === step;
          return (
            <button
              key={step}
              type="button"
              onClick={() => updateParam("min", step > 0 ? String(step) : null)}
              aria-pressed={active}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-mono tabular-nums transition-colors",
                focusRing,
                active
                  ? "bg-emerald-400/20 text-emerald-200 border border-emerald-400/40"
                  : "bg-white/5 text-foreground/70 hover:bg-white/8 border border-white/10",
              )}
            >
              {step === 0 ? "Any" : `${step}+`}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/8 text-xs text-foreground/55">
        <span>
          {filtersOn
            ? `${filteredCount} of ${totalCount} picks match`
            : `${totalCount} picks today`}
        </span>
        {filtersOn ? (
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              next.delete("market");
              next.delete("min");
              const qs = next.toString();
              startTransition(() =>
                router.replace(qs ? `/?${qs}` : "/", { scroll: false }),
              );
            }}
            className={cx(
              "rounded-full px-2.5 py-1 text-[11px] text-foreground/70 hover:text-foreground hover:bg-white/5",
              focusRing,
            )}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
