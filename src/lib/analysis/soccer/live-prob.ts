// Pure in-play win probability: pre-match consensus + current score + minute.
//
// Model: independent Poisson goals per side for the *remaining* minutes. The
// pre-match 1X2 consensus and the totals line pin the two teams' full-match
// expected goals (λ_home, λ_away); what's left of the match scales them down
// linearly (plus a small stoppage allowance), and the final-score distribution
// over the remaining goals is combined with the goals already scored. No DB,
// no fetch — feed it the numbers and it returns three probabilities that sum
// to one.

export type PreMatchRead = {
  /** De-vigged 1X2 consensus. Any missing side is treated as 0. */
  home: number;
  draw: number;
  away: number;
  /** Consensus total-goals line (e.g. 2.5) and P(over) at that line, if priced. */
  totalLine?: number | null;
  overProb?: number | null;
};

export type LiveState = {
  homeGoals: number;
  awayGoals: number;
  /** Minutes played, 0..~95. Use 45 at half time. */
  minute: number;
  /** Half-time or not started: no clock running — treat as elapsed minutes. */
  finished?: boolean;
};

export type WinProbability = { home: number; draw: number; away: number };

const MAX_GOALS = 10; // truncation for the Poisson sums
const REG_MINUTES = 90;

function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

// 1X2 probabilities from two independent Poisson rates.
export function outcomeProbs(lh: number, la: number): WinProbability {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    const ph = poissonPmf(lh, h);
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = ph * poissonPmf(la, a);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  const s = home + draw + away || 1;
  return { home: home / s, draw: draw / s, away: away / s };
}

// Back out (λ_home, λ_away) from the pre-match read: total goals from the
// O/U line (or a 2.6 default), the split from the home/away edge, refined by
// a short search so the implied 1X2 matches the consensus as closely as the
// Poisson family allows.
export function impliedRates(read: PreMatchRead): { home: number; away: number } {
  let total = 2.6;
  if (read.totalLine && read.overProb != null) {
    // Nudge the total toward the side of the line the market leans.
    total = read.totalLine + (read.overProb - 0.5) * 1.2;
  }
  total = Math.max(1.2, Math.min(4.5, total));

  const target = normalize(read);
  let best = { home: total / 2, away: total / 2 };
  let bestErr = Infinity;
  for (let share = 0.2; share <= 0.8; share += 0.01) {
    const lh = total * share;
    const la = total - lh;
    const p = outcomeProbs(lh, la);
    const err =
      (p.home - target.home) ** 2 + (p.draw - target.draw) ** 2 + (p.away - target.away) ** 2;
    if (err < bestErr) {
      bestErr = err;
      best = { home: lh, away: la };
    }
  }
  return best;
}

function normalize(read: PreMatchRead): WinProbability {
  const h = Math.max(0, read.home || 0);
  const d = Math.max(0, read.draw || 0);
  const a = Math.max(0, read.away || 0);
  const s = h + d + a;
  if (s <= 0) return { home: 0.4, draw: 0.27, away: 0.33 };
  return { home: h / s, draw: d / s, away: a / s };
}

// Live 1X2 given the pre-match read and where the match stands now.
export function liveWinProbability(read: PreMatchRead, state: LiveState): WinProbability {
  if (state.finished) {
    if (state.homeGoals > state.awayGoals) return { home: 1, draw: 0, away: 0 };
    if (state.homeGoals < state.awayGoals) return { home: 0, draw: 0, away: 1 };
    return { home: 0, draw: 1, away: 0 };
  }
  const rates = impliedRates(read);
  const minute = Math.max(0, Math.min(REG_MINUTES + 8, state.minute));
  // Stoppage allowance: a little extra playing time beyond 90.
  const remaining = Math.max(0, REG_MINUTES + 4 - minute) / REG_MINUTES;
  const lh = rates.home * remaining;
  const la = rates.away * remaining;

  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    const ph = poissonPmf(lh, h);
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = ph * poissonPmf(la, a);
      const fh = state.homeGoals + h;
      const fa = state.awayGoals + a;
      if (fh > fa) home += p;
      else if (fh === fa) draw += p;
      else away += p;
    }
  }
  const s = home + draw + away || 1;
  return { home: home / s, draw: draw / s, away: away / s };
}

// Parse ESPN's display clock ("67'", "45'+2'", "90'+4'") into minutes played.
export function minutesFromClock(clock: string | null, period: number): number {
  if (!clock) return period >= 2 ? 45 : 0;
  const m = clock.match(/(\d+)'(?:\+(\d+)')?/);
  if (!m) return period >= 2 ? 45 : 0;
  return Number(m[1]) + (m[2] ? Number(m[2]) : 0);
}
