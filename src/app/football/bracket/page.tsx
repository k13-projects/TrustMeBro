import Link from "next/link";
import { bracketColumns, groupIntoTies } from "@/lib/sports/soccer/bracket";
import { activeCompetition } from "@/lib/sports/soccer/competition-cookie";
import { COMPETITIONS, QUALIFYING_STAGES } from "@/lib/sports/soccer/competitions";
import { getRounds } from "@/lib/sports/soccer/queries";
import { Bracket } from "@/components/soccer/Bracket";
import { FootballHeader } from "@/components/soccer/FootballHeader";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ phase?: string }> };

// The knockout picture for the active competition. UEFA competitions have two
// knockout trees a season — the summer qualifying path into the league phase,
// and the spring bracket from the play-offs to the final; `?phase=` switches.
// The World Cup archive is one tree, Round of 32 to the final.
export default async function BracketPage({ searchParams }: PageProps) {
  const [{ phase }, competition] = await Promise.all([searchParams, activeCompetition()]);
  const meta = COMPETITIONS[competition];
  const rounds = await getRounds(competition);
  const matches = rounds.flatMap((r) => r.matches);
  const ties = groupIntoTies(matches);

  const qualifying = ties.filter((t) => QUALIFYING_STAGES.has(t.stage));
  const finals = ties.filter((t) => !QUALIFYING_STAGES.has(t.stage));
  const hasBoth = qualifying.length > 0 && finals.length > 0;
  const showQualifying =
    qualifying.length > 0 && (phase === "qualifying" || finals.length === 0);
  const shown = showQualifying ? qualifying : finals;
  const columns = bracketColumns(shown);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <FootballHeader title="Bracket" competition={competition} />
        <p className="mt-2 max-w-2xl text-sm text-foreground/55">
          {meta.kind === "club"
            ? "Every knockout tie, both legs and the aggregate. The road into the league phase in summer; the road to the final from February."
            : "The knockout rounds as they were played, from the Round of 32 to the final."}
        </p>
      </div>

      {hasBoth || (qualifying.length > 0 && meta.status === "live") ? (
        <div className="flex flex-wrap gap-2">
          <PhasePill href="/football/bracket?phase=qualifying" active={showQualifying}>
            Qualifying path
          </PhasePill>
          <PhasePill href="/football/bracket" active={!showQualifying} disabled={finals.length === 0}>
            {finals.length === 0 ? "Knockout stage · from February" : "Knockout stage"}
          </PhasePill>
        </div>
      ) : null}

      {columns.length > 0 ? (
        <Bracket columns={columns} competition={competition} />
      ) : (
        <p className="rounded-2xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center text-sm text-foreground/45">
          No knockout ties on record yet. The bracket fills in as the league
          phase ends — see the{" "}
          <Link href="/football/standings" className="font-semibold text-primary">
            table
          </Link>{" "}
          for who&apos;s on course.
        </p>
      )}
    </div>
  );
}

function PhasePill({
  href,
  active,
  disabled = false,
  children,
}: {
  href: string;
  active: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls = `inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : disabled
        ? "border-border/50 text-foreground/35"
        : "border-border/70 bg-black/30 text-foreground/80 hover:border-primary/50 hover:text-foreground"
  }`;
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cls}>
      {children}
    </Link>
  );
}
