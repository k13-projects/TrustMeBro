import Link from "next/link";
import type { Round } from "@/lib/sports/soccer/queries";

// Horizontal round strip for the schedule: qualifying rounds, league-phase
// matchdays, knockout rounds — in calendar order, current one lit. Server
// component; each pill is a plain link (?round=<key>) so it's crawlable and
// works without JS.
export function RoundNav({
  rounds,
  activeKey,
  basePath,
  leagueLabel = "League Phase",
}: {
  rounds: Round[];
  activeKey: string | null;
  basePath: string;
  /** Group heading for `kind === "league"` rounds — "League Phase" only
   *  means something for UEFA's competitions. A domestic single-table
   *  league (Süper Lig) hits the same `kind: "league"` bucket for its
   *  weekly matchdays but has no such phase; pass the competition's own
   *  `phaseLabel` (e.g. "Regular Season") instead. */
  leagueLabel?: string;
}) {
  const short = (r: Round) => {
    if (r.kind === "league") return r.label.replace("Matchday ", "MD");
    switch (r.key) {
      case "first-round":
        return "Q1";
      case "second-round":
        return "Q2";
      case "third-round":
        return "Q3";
      case "playoff-round":
        return "Play-offs";
      default:
        return r.label;
    }
  };
  const groups: Array<{ title: string; items: Round[] }> = [
    { title: "Qualifying", items: rounds.filter((r) => r.kind === "qualifying") },
    { title: leagueLabel, items: rounds.filter((r) => r.kind === "league") },
    { title: "Knockouts", items: rounds.filter((r) => r.kind === "knockout") },
  ].filter((g) => g.items.length > 0);

  return (
    <nav
      aria-label="Rounds"
      className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(90deg,#000_0,#000_calc(100%-3rem),transparent)]"
    >
      <div className="flex w-max items-end gap-5">
        {groups.map((g) => (
          <div key={g.title} className="space-y-1.5">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/40">
              {g.title}
            </div>
            <div className="flex items-center gap-1.5">
              {g.items.map((r) => {
                const active = r.key === activeKey;
                const done = r.total > 0 && r.played === r.total;
                return (
                  <Link
                    key={r.key}
                    href={`${basePath}?round=${encodeURIComponent(r.key)}`}
                    aria-current={active ? "page" : undefined}
                    title={`${r.label} · ${r.played}/${r.total} played`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : done
                          ? "border-border/60 bg-white/[0.03] text-foreground/55 hover:text-foreground hover:border-border"
                          : "border-border/70 bg-black/30 text-foreground/80 hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {short(r)}
                    {!done && r.played > 0 ? (
                      <span
                        aria-hidden
                        className={`size-1.5 rounded-full ${active ? "bg-primary-foreground" : "bg-primary"} animate-pulse`}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
