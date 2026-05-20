// Phase 2 calibration layer (see .claude/ENGINE_STRATEGY.md).
//
// The raw distribution probability from probability.ts is consistently
// OVERCONFIDENT by ~5-6 points in the tail — measured by backtesting deep alt
// lines against the recovered 276-pick sample on 2026-05-20:
//
//   raw model P → real hit rate
//     0.70 → 0.632
//     0.75 → 0.703
//     0.80 → 0.742
//     0.85 → 0.795
//     0.90 → 0.845
//
// We map raw → calibrated by linear interpolation over those anchors so the
// number we SHOW equals the rate we actually hit. Refit these anchors from
// /api/admin/calibration as the settled sample grows (this is a small, recent
// playoff sample — treat the haircut as provisional).

const ANCHORS: ReadonlyArray<readonly [raw: number, real: number]> = [
  [0.5, 0.5],
  [0.7, 0.632],
  [0.75, 0.703],
  [0.8, 0.742],
  [0.85, 0.795],
  [0.9, 0.845],
  [1.0, 0.93], // extrapolated cap — we never claim certainty
];

/** Map a raw model probability to the empirically-calibrated hit rate. */
export function calibrate(rawP: number): number {
  const p = Math.min(1, Math.max(0, rawP));
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x0, y0] = ANCHORS[i - 1];
    const [x1, y1] = ANCHORS[i];
    if (p <= x1) {
      const t = x1 === x0 ? 0 : (p - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return ANCHORS[ANCHORS.length - 1][1];
}

/**
 * Inverse: the raw model P needed to achieve a target calibrated hit rate.
 * Used to translate the product target (e.g. "real 85%") into the raw
 * threshold the selector compares against.
 */
export function rawForCalibrated(targetReal: number): number {
  const t = Math.min(1, Math.max(0, targetReal));
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x0, y0] = ANCHORS[i - 1];
    const [x1, y1] = ANCHORS[i];
    if (t <= y1) {
      const f = y1 === y0 ? 0 : (t - y0) / (y1 - y0);
      return x0 + f * (x1 - x0);
    }
  }
  return 1;
}
