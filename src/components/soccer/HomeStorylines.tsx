import type { HomeNewsItem } from "@/lib/sports/soccer/home-queries";

// The week's reading, for the long gap between rounds. Engine takes are
// labelled so nobody mistakes them for a writer's reporting.
export function HomeStorylines({ items }: { items: HomeNewsItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => {
        const when = new Date(item.published_at);
        const whenLabel = Number.isFinite(when.getTime())
          ? when.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : null;
        const body = (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ring-1 ${
                  item.is_engine_take
                    ? "bg-primary/15 text-primary ring-primary/30"
                    : "bg-foreground/5 text-foreground/80 ring-border"
                }`}
              >
                {item.is_engine_take ? "Engine take" : item.outlet}
              </span>
              {whenLabel ? (
                <span className="text-[11px] text-foreground/40">{whenLabel}</span>
              ) : null}
            </div>
            {item.headline ? (
              <h3 className="mt-2 font-display text-base uppercase leading-snug tracking-tight">
                {item.headline}
              </h3>
            ) : null}
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-foreground/70">
              {item.summary}
            </p>
          </>
        );
        return item.source_url?.startsWith("http") ? (
          <a
            key={item.id}
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-border/60 bg-card/40 p-4 transition-transform hover:-translate-y-0.5"
          >
            {body}
          </a>
        ) : (
          <div
            key={item.id}
            className="rounded-2xl border border-border/60 bg-card/40 p-4"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
