import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isoDateOffset, todayIsoDate } from "@/lib/date";
import { maybeRefresh } from "@/lib/ingest/refresh";
import { runSoccerNewsIngest } from "@/lib/signals/news/soccer";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS } from "@/lib/sports/soccer/competitions";
import { FootballHeader } from "@/components/soccer/FootballHeader";
import { NewsFilterBar, type NewsFilterTeam } from "@/components/soccer/NewsFilterBar";
import {
  SoccerNewsCard,
  type SoccerNewsCardItem,
  type SoccerNewsCardTeam,
} from "@/components/soccer/SoccerNewsCard";

export const dynamic = "force-dynamic";
// Headroom for the post-response background refresh (~4s ingest). Hobby ≤ 60s.
export const maxDuration = 30;

type PageProps = { searchParams: Promise<{ team?: string }> };

type NewsRow = SoccerNewsCardItem & { is_engine_take: boolean };
type TeamRow = { id: number; name: string; abbreviation: string; crest_url: string | null };

export default async function FootballNewsPage({ searchParams }: PageProps) {
  const [{ team }, competition] = await Promise.all([
    searchParams,
    activeCompetition(),
  ]);
  const meta = COMPETITIONS[competition];
  const archived = meta.status === "archived";
  const activeTeam = team && /^\d+$/.test(team) ? Number(team) : null;

  // Serve cached rows now; if the feed is older than 30 min, refresh it in the
  // background after the response ships. Single-flight, so a crowd triggers one
  // pull. This is why we don't need the cron to fire when nobody's around.
  // Archived competitions never refresh — their feed is a record.
  if (!archived) {
    after(() =>
      maybeRefresh({
        key: `soccer_news:${competition}`,
        staleAfterMs: 30 * 60_000,
        run: () => runSoccerNewsIngest({ competition, sinceHours: 24 }),
      }),
    );
  }

  const supabase = await createSupabaseServerClient();

  // Live: 3-day window — overnight pubs for last night's games + the upcoming
  // slate. Archived: the tournament's final fortnight, so the page still reads.
  const start = archived
    ? "2026-07-05"
    : isoDateOffset(todayIsoDate(), -2);
  const startIso = `${start}T00:00:00Z`;

  // Every team referenced by recent news — drives the filter bar (independent
  // of the active filter, so the bar stays stable as you click around).
  const { data: tagRows } = await supabase
    .from("soccer_news")
    .select("team_ids")
    .eq("competition", competition)
    .gte("published_at", startIso)
    .limit(400);
  const taggedIds = new Set<number>();
  for (const r of (tagRows ?? []) as Array<{ team_ids: number[] }>) {
    for (const id of r.team_ids ?? []) taggedIds.add(id);
  }
  const { data: teamsRaw } = taggedIds.size
    ? await supabase
        .from("soccer_teams")
        .select("id, name, abbreviation, crest_url")
        .in("id", [...taggedIds])
    : { data: [] as TeamRow[] };
  const teams = (teamsRaw ?? []) as TeamRow[];
  const teamById = new Map<number, SoccerNewsCardTeam>(
    teams.map((t) => [
      t.id,
      { id: t.id, name: t.name, abbreviation: t.abbreviation, crest: t.crest_url },
    ]),
  );
  const filterTeams: NewsFilterTeam[] = teams
    .map((t) => ({ id: t.id, name: t.name, abbreviation: t.abbreviation, crest: t.crest_url }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let query = supabase
    .from("soccer_news")
    .select(
      "id, source_url, outlet, author, headline, summary, image_url, team_ids, player_names, is_engine_take, published_at",
    )
    .eq("competition", competition)
    .gte("published_at", startIso)
    .order("published_at", { ascending: false })
    .limit(60);
  if (activeTeam !== null) query = query.contains("team_ids", [activeTeam]);
  const { data: rowsRaw } = await query;
  const rows = (rowsRaw ?? []) as NewsRow[];

  const writerItems = rows.filter((r) => !r.is_engine_take);
  const engineItems = rows.filter((r) => r.is_engine_take);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <FootballHeader title="News" competition={competition} />
      <p className="-mt-3 max-w-2xl text-sm text-muted-foreground">
        {archived
          ? "The tournament's closing fortnight, as it was covered — preserved with the rest of the record."
          : `Short takes on the ${meta.label} from ESPN, BBC, The Guardian, Google News and Turkish sports desks — tagged by the ${meta.kind === "club" ? "clubs" : "countries"} and stars they're about. Every item links back to the source. Pick a team to filter; default shows all.`}
      </p>

      {filterTeams.length > 0 ? (
        <NewsFilterBar teams={filterTeams} activeTeam={activeTeam} />
      ) : null}

      {rows.length === 0 ? (
        <EmptyState filtered={activeTeam !== null} competition={meta.label} />
      ) : null}

      {writerItems.length > 0 ? (
        <section className="space-y-4">
          <SubSectionTitle title="Latest" count={writerItems.length} />
          <div className="grid grid-cols-1 gap-4">
            {writerItems.map((it) => (
              <SoccerNewsCard key={it.id} item={it} teamById={teamById} />
            ))}
          </div>
        </section>
      ) : null}

      {engineItems.length > 0 ? (
        <section className="space-y-4">
          <SubSectionTitle title="TrustMeBro engine takes" count={engineItems.length} />
          <p className="-mt-2 text-xs text-muted-foreground">
            Generated by our analysis engine for matches without press coverage
            yet. Not a writer quote.
          </p>
          <div className="grid grid-cols-1 gap-4">
            {engineItems.map((it) => (
              <SoccerNewsCard key={it.id} item={it} teamById={teamById} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SubSectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-display text-xl uppercase tracking-tight sm:text-2xl">
        {title}
      </h2>
      <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        {count} item{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function EmptyState({
  filtered,
  competition,
}: {
  filtered: boolean;
  competition: string;
}) {
  return (
    <div className="card-tmb space-y-3 p-10 text-center">
      <p className="text-foreground/85">
        {filtered
          ? "No recent news for that team yet."
          : `No fresh ${competition} news right now.`}
      </p>
      <p className="text-xs text-muted-foreground">
        The feed sweeps ESPN, BBC, Google News and Turkish sports desks every few
        hours. New items appear here as they publish.
      </p>
    </div>
  );
}
