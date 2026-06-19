import { CountryFlag } from "@/components/soccer/CountryFlag";

export type SoccerNewsCardTeam = {
  id: number;
  name: string;
  abbreviation: string;
  crest: string | null;
};

export type SoccerNewsCardItem = {
  id: number;
  source_url: string | null;
  outlet: string;
  author: string | null;
  headline: string | null;
  summary: string;
  image_url: string | null;
  team_ids: number[];
  player_names: string[];
  is_engine_take: boolean;
  published_at: string;
};

// Image-first news card. Real thumbnail when the source ships one; otherwise we
// fall back to the lead country's flag so the card never reads as broken. The
// "subject" row tags the World Cup sides + any curated star names mentioned.
export function SoccerNewsCard({
  item,
  teamById,
}: {
  item: SoccerNewsCardItem;
  teamById: Map<number, SoccerNewsCardTeam>;
}) {
  const teams = (item.team_ids ?? [])
    .map((id) => teamById.get(id))
    .filter((t): t is SoccerNewsCardTeam => !!t)
    .slice(0, 3);
  const lead = teams[0];

  const when = new Date(item.published_at);
  const whenLabel = Number.isFinite(when.getTime())
    ? when.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const isExternal = item.source_url?.startsWith("http");

  return (
    <article className="card-tmb flex gap-4 p-4 transition-transform hover:-translate-y-0.5 sm:p-5">
      <Thumb item={item} lead={lead} />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ring-1 ${
                item.is_engine_take
                  ? "bg-primary/15 text-primary ring-primary/30"
                  : "bg-foreground/5 text-foreground/85 ring-border"
              }`}
            >
              {item.is_engine_take ? "Engine Take" : item.outlet}
            </span>
            {item.author && !item.is_engine_take ? (
              <span className="text-xs text-muted-foreground">
                by <span className="text-foreground/85">{item.author}</span>
              </span>
            ) : null}
          </div>
          {whenLabel ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {whenLabel}
            </span>
          ) : null}
        </div>

        {item.headline ? (
          <h3 className="font-display text-base uppercase leading-snug tracking-tight sm:text-lg">
            {item.headline}
          </h3>
        ) : null}
        <p className="text-sm leading-relaxed text-foreground/85">{item.summary}</p>

        {teams.length > 0 || item.player_names.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {teams.map((t) => (
              <span
                key={`t-${t.id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-1 text-[11px] text-foreground/85"
              >
                <CountryFlag crest={t.crest} abbr={t.abbreviation} name={t.name} size={14} />
                {t.name}
              </span>
            ))}
            {item.player_names.slice(0, 3).map((p) => (
              <span
                key={`p-${p}`}
                className="inline-flex items-center rounded-full bg-foreground/5 px-2 py-1 text-[11px] text-foreground/70"
              >
                {p}
              </span>
            ))}
          </div>
        ) : null}

        {item.source_url ? (
          <div className="pt-1">
            {isExternal ? (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] uppercase tracking-[0.18em] text-primary transition-opacity hover:opacity-80"
              >
                Read on {item.outlet} ↗
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Thumb({
  item,
  lead,
}: {
  item: SoccerNewsCardItem;
  lead: SoccerNewsCardTeam | undefined;
}) {
  return (
    <div className="relative hidden h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-foreground/5 ring-1 ring-border sm:flex sm:items-center sm:justify-center">
      {item.image_url ? (
        // Arbitrary outlet CDNs — plain <img> (next/image needs per-host config).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={item.headline ?? "news thumbnail"}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : lead ? (
        <CountryFlag crest={lead.crest} abbr={lead.abbreviation} name={lead.name} size={40} />
      ) : (
        <span className="text-2xl">⚽</span>
      )}
    </div>
  );
}
