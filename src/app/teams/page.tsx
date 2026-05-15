import { nbaProvider } from "@/lib/sports/nba";
import type { Team } from "@/lib/sports/types";

export const revalidate = 86400;

export default async function TeamsPage() {
  let teams: Team[] = [];
  let error: string | null = null;
  try {
    teams = await nbaProvider().listTeams();
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const byConf = teams.reduce<Record<string, Team[]>>((acc, t) => {
    const conf = t.conference || "Other";
    (acc[conf] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">NBA teams</h1>
      {error ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6">
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {Object.entries(byConf).map(([conf, list]) => (
            <section key={conf}>
              <h2 className="text-sm uppercase tracking-wider text-foreground/60 mb-3">
                {conf}
              </h2>
              <ul className="space-y-1">
                {list
                  .slice()
                  .sort((a, b) => a.full_name.localeCompare(b.full_name))
                  .map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span>{t.full_name}</span>
                      <span className="text-xs text-foreground/50">
                        {t.division}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
