import type { MatchPreview as Preview } from "@/lib/sports/soccer/match-preview";
import type { MatchRow } from "@/lib/sports/soccer/queries";
import { TeamCrest } from "./TeamCrest";
import { CountryFlag } from "./CountryFlag";

// What to expect, before a ball is kicked. Every sentence and every bar comes
// from data already on the page, so there is nothing here to take on trust.
export function MatchPreview({
  match,
  preview,
  national,
}: {
  match: MatchRow;
  preview: Preview;
  national: boolean;
}) {
  const { homeForm, awayForm } = preview;
  if (preview.paragraphs.length === 0 && homeForm.played === 0 && awayForm.played === 0) {
    return null;
  }
  const maxGoals = Math.max(
    homeForm.goalsFor,
    homeForm.goalsAgainst,
    awayForm.goalsFor,
    awayForm.goalsAgainst,
    1,
  );

  return (
    <section className="space-y-5">
      <h2 className="font-display text-xl uppercase tracking-tight">The preview</h2>

      {preview.paragraphs.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-5 text-sm leading-relaxed text-foreground/80">
          {preview.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : null}

      {homeForm.played > 0 || awayForm.played > 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
          <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamLabel team={match.home} national={national} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/35">
              Last {Math.max(homeForm.played, awayForm.played)}
            </span>
            <TeamLabel team={match.away} national={national} align="right" />
          </div>

          <Row label="Form">
            <FormChips sequence={homeForm.sequence} />
            <FormChips sequence={awayForm.sequence} align="right" />
          </Row>
          <Bars
            label="Scored"
            left={homeForm.goalsFor}
            right={awayForm.goalsFor}
            max={maxGoals}
            tone="positive"
          />
          <Bars
            label="Conceded"
            left={homeForm.goalsAgainst}
            right={awayForm.goalsAgainst}
            max={maxGoals}
            tone="negative"
          />
          <Row label="Clean sheets">
            <span className="text-sm font-bold tabular-nums">{homeForm.cleanSheets}</span>
            <span className="text-right text-sm font-bold tabular-nums">
              {awayForm.cleanSheets}
            </span>
          </Row>
          <p className="mt-3 text-[11px] text-foreground/40">
            Across all competitions, newest first.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function TeamLabel({
  team,
  national,
  align = "left",
}: {
  team: MatchRow["home"];
  national: boolean;
  align?: "left" | "right";
}) {
  return (
    <span
      className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      {national ? (
        <CountryFlag crest={team.crest} abbr={team.abbreviation} name={team.name} size={20} />
      ) : (
        <TeamCrest crest={team.crest} name={team.name} size={22} />
      )}
      <span className="min-w-0 truncate font-display text-sm uppercase tracking-wide">
        {team.name}
      </span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const kids = Array.isArray(children) ? children : [children];
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-border/40 py-2.5">
      <div className="min-w-0">{kids[0]}</div>
      <span className="w-24 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/40">
        {label}
      </span>
      <div className="min-w-0">{kids[1]}</div>
    </div>
  );
}

function FormChips({
  sequence,
  align = "left",
}: {
  sequence: Array<"W" | "D" | "L">;
  align?: "left" | "right";
}) {
  if (sequence.length === 0) {
    return <span className="text-xs text-foreground/35">no results</span>;
  }
  return (
    <span className={`flex gap-1 ${align === "right" ? "justify-end" : ""}`}>
      {sequence.map((r, i) => (
        <span
          key={i}
          title={r === "W" ? "Won" : r === "D" ? "Drawn" : "Lost"}
          className={`grid size-5 place-items-center rounded text-[10px] font-bold ${
            r === "W"
              ? "bg-emerald-400/20 text-emerald-300"
              : r === "D"
                ? "bg-white/10 text-foreground/70"
                : "bg-rose-400/20 text-rose-300"
          }`}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function Bars({
  label,
  left,
  right,
  max,
  tone,
}: {
  label: string;
  left: number;
  right: number;
  max: number;
  tone: "positive" | "negative";
}) {
  const colour = tone === "positive" ? "bg-emerald-400/70" : "bg-rose-400/70";
  return (
    <Row label={label}>
      <span className="flex items-center gap-2">
        <span className="flex h-2 flex-1 justify-end overflow-hidden rounded-full bg-white/6">
          <span
            className={`h-full rounded-full ${colour}`}
            style={{ width: `${Math.round((left / max) * 100)}%` }}
          />
        </span>
        <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums">{left}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-sm font-bold tabular-nums">{right}</span>
        <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-white/6">
          <span
            className={`h-full rounded-full ${colour}`}
            style={{ width: `${Math.round((right / max) * 100)}%` }}
          />
        </span>
      </span>
    </Row>
  );
}
