import type { MatchRow } from "./queries";
import { QUALIFYING_STAGES } from "./competitions";

// Pure shaping of knockout fixtures into ties (a tie = one or two legs
// between the same two clubs in the same stage), with aggregate score and the
// side that went through. Drives the bracket view; works for the World Cup's
// single-leg rounds and UEFA's two-legged ties alike.

export type Tie = {
  key: string;
  stage: string;
  stageLabel: string;
  teamA: MatchRow["home"]; // first leg's home side
  teamB: MatchRow["away"];
  legs: MatchRow[]; // chronological
  aggA: number;
  aggB: number;
  decided: boolean;
  /** "A" | "B" once decided (aggregate, or the later leg's winner when level — shootout/ET). */
  winner: "A" | "B" | null;
  from: string;
  to: string;
};

const STAGE_ORDER = [
  "first-round",
  "second-round",
  "third-round",
  "playoff-round",
  "knockout-playoff",
  "knockout-round-playoffs",
  "round-of-32",
  "round-of-16",
  "quarterfinals",
  "semifinals",
  "3rd-place-match",
  "final",
];

const STAGE_LABEL: Record<string, string> = {
  "first-round": "Q1",
  "second-round": "Q2",
  "third-round": "Q3",
  "playoff-round": "Play-offs",
  "knockout-playoff": "Knockout play-offs",
  "knockout-round-playoffs": "Knockout play-offs",
  "round-of-32": "Round of 32",
  "round-of-16": "Round of 16",
  quarterfinals: "Quarter-finals",
  semifinals: "Semi-finals",
  "3rd-place-match": "Third place",
  final: "Final",
};

// Allowlist, not a denylist: a single-table league's stage is one constant
// slug that never appears here (e.g. Süper Lig's ESPN season.slug), so it
// correctly reads as "no bracket" instead of every fixture reading as a
// fabricated knockout tie.
export function isKnockoutStage(stage: string | null): boolean {
  return !!stage && STAGE_ORDER.includes(stage);
}

export function groupIntoTies(matches: MatchRow[]): Tie[] {
  const byKey = new Map<string, Tie>();
  const sorted = [...matches]
    .filter((m) => isKnockoutStage(m.stage))
    .sort((a, b) => (a.datetime ?? a.date).localeCompare(b.datetime ?? b.date));

  for (const m of sorted) {
    const pair = [m.home.id, m.away.id].sort((a, b) => a - b).join("-");
    const key = `${m.stage}:${pair}`;
    let tie = byKey.get(key);
    if (!tie) {
      tie = {
        key,
        stage: m.stage!,
        stageLabel: STAGE_LABEL[m.stage!] ?? m.stage!,
        teamA: m.home,
        teamB: m.away,
        legs: [],
        aggA: 0,
        aggB: 0,
        decided: false,
        winner: null,
        from: m.date,
        to: m.date,
      };
      byKey.set(key, tie);
    }
    tie.legs.push(m);
    tie.to = m.date;
    if (m.finished) {
      const aIsHome = m.home.id === tie.teamA.id;
      tie.aggA += aIsHome ? m.home_score : m.away_score;
      tie.aggB += aIsHome ? m.away_score : m.home_score;
    }
  }

  for (const tie of byKey.values()) {
    const twoLegged = QUALIFYING_STAGES.has(tie.stage) || tie.stage.includes("playoff") || tie.legs.length > 1;
    const expectedLegs = twoLegged ? 2 : 1;
    const played = tie.legs.filter((l) => l.finished).length;
    tie.decided = played >= expectedLegs;
    if (tie.decided) {
      if (tie.aggA > tie.aggB) tie.winner = "A";
      else if (tie.aggB > tie.aggA) tie.winner = "B";
      else {
        // Level on aggregate: extra time / penalties decided it. ESPN flags
        // the winner on the deciding leg; without the flag, leave it open.
        const last = tie.legs[tie.legs.length - 1];
        tie.winner =
          last.winner_team_id === tie.teamA.id
            ? "A"
            : last.winner_team_id === tie.teamB.id
              ? "B"
              : null;
      }
    }
  }

  return [...byKey.values()].sort(
    (a, b) =>
      STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.from.localeCompare(b.from),
  );
}

// Ties grouped by stage in bracket order — the columns of the bracket view.
export function bracketColumns(ties: Tie[]): Array<{ stage: string; label: string; ties: Tie[] }> {
  const cols = new Map<string, Tie[]>();
  for (const t of ties) {
    const list = cols.get(t.stage) ?? [];
    list.push(t);
    cols.set(t.stage, list);
  }
  return [...cols.entries()]
    .sort((a, b) => STAGE_ORDER.indexOf(a[0]) - STAGE_ORDER.indexOf(b[0]))
    .map(([stage, list]) => ({ stage, label: STAGE_LABEL[stage] ?? stage, ties: list }));
}
