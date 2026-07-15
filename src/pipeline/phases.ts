// Takeoff & landing detection (Milestone 3) — the sole thing jump height depends on.
//
// Works from vertical (y) motion only, so it is camera-angle agnostic (front or side view):
// flight time is a temporal measurement, unaffected by viewing angle.
//
// Coordinate reminder (see types.ts): normalized image y INCREASES DOWNWARD. The athlete
// going up means y decreases; "up" velocity is therefore NEGATIVE.
//
// PRIMARY detector: center-of-mass (hip midpoint) VELOCITY. The hip traces a clean parabola
// through a jump. Peak upward velocity ≈ takeoff (after leaving the ground only gravity acts,
// so velocity can only decrease); peak downward velocity ≈ landing (ground impact then
// decelerates it). This is robust even when foot tracking is noisy or the foot "ground level"
// drifts (common in front view / low fps / motion blur).
//
// CROSS-CHECK detector: foot baseline crossings — where the lowest foot leaves and returns to
// its resting level. Reliable on clean high-fps side views; reported as an agreement check.

import { LM } from './landmarks';
import type { FramePose, Landmark } from './types';
import type { FrameInfo } from './frames';

const VIS = 0.3;
/** Minimum hip rise (normalized) for a clip to contain a real jump. */
const MIN_JUMP_RANGE = 0.03;
/** Half-window (seconds) each side of the apex to search for takeoff/landing. */
const SEARCH_WINDOW_S = 0.8;
// Foot cross-check "airborne" margin below the foot baseline (noise-scaled, clamped).
const GROUND_MARGIN_MAD_K = 5;
const GROUND_MARGIN_MIN = 0.006;
const GROUND_MARGIN_MAX_FRACTION = 0.25;

export interface PhaseResult {
  ok: boolean;
  message?: string;
  /** Per-frame series (gap-filled + smoothed) used for detection and visualization. */
  hipY: number[];
  footY: number[];
  /** Raw gap-filled series before smoothing — for debugging the signal. */
  rawHipY: number[];
  rawFootY: number[];
  /** Foot resting level and the airborne threshold (for the chart + cross-check). */
  groundBaseline: number;
  airborneThreshold: number;
  apexFrame: number;
  /** Primary (hip-velocity) detection. */
  takeoffFrame: number;
  landingFrame: number;
  flightTimeS: number;
  /** Foot-baseline cross-check. */
  crossTakeoffFrame: number;
  crossLandingFrame: number;
  takeoffAgreement: number; // |primary − cross| in frames, or -1 if N/A
  landingAgreement: number;
}

function vis(lm: Landmark | undefined): boolean {
  return !!lm && (lm.visibility ?? 0) >= VIS;
}

function hipMidY(p: FramePose): number {
  const l = p.landmarks[LM.LEFT_HIP];
  const r = p.landmarks[LM.RIGHT_HIP];
  if (vis(l) && vis(r)) return (l!.y + r!.y) / 2;
  if (vis(l)) return l!.y;
  if (vis(r)) return r!.y;
  return NaN;
}

/** Lowest visible foot point (max y) — closest to the ground. */
function feetGroundY(p: FramePose): number {
  const idxs = [LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX];
  let maxY = NaN;
  for (const i of idxs) {
    const lm = p.landmarks[i];
    if (vis(lm)) maxY = Number.isNaN(maxY) ? lm!.y : Math.max(maxY, lm!.y);
  }
  return maxY;
}

/** Fill NaN gaps by forward-fill then back-fill, so short dropouts don't break detection. */
function fillGaps(arr: number[]): number[] {
  const out = [...arr];
  let last = NaN;
  for (let i = 0; i < out.length; i++) {
    if (!Number.isNaN(out[i])) last = out[i];
    else out[i] = last;
  }
  let next = NaN;
  for (let i = out.length - 1; i >= 0; i--) {
    if (!Number.isNaN(out[i])) next = out[i];
    else out[i] = next;
  }
  return out;
}

function median(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Sliding-window median — removes single-frame landmark spikes without lagging edges. */
function medianFilter(arr: number[], win = 5): number[] {
  const half = Math.floor(win / 2);
  const out = arr.slice();
  for (let i = 0; i < arr.length; i++) {
    const seg: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      if (!Number.isNaN(arr[j])) seg.push(arr[j]);
    }
    if (seg.length) out[i] = median(seg);
  }
  return out;
}

function argExtreme(arr: number[], lo: number, hi: number, mode: 'min' | 'max'): number {
  let best = -1;
  let bestVal = mode === 'min' ? Infinity : -Infinity;
  for (let i = Math.max(0, lo); i <= Math.min(arr.length - 1, hi); i++) {
    if ((mode === 'min' && arr[i] < bestVal) || (mode === 'max' && arr[i] > bestVal)) {
      bestVal = arr[i];
      best = i;
    }
  }
  return best;
}

export function detectPhases(poses: FramePose[], frames: FrameInfo[]): PhaseResult {
  const N = poses.length;
  const rawHipY = fillGaps(poses.map(hipMidY));
  const rawFootY = fillGaps(poses.map(feetGroundY));
  const hipY = medianFilter(rawHipY, 5);
  const footY = medianFilter(rawFootY, 5);

  const hipBaseline = median(hipY.filter((v) => !Number.isNaN(v)));
  const footBaseline = median(footY.filter((v) => !Number.isNaN(v)));
  const apexFrame = argExtreme(hipY, 0, N - 1, 'min'); // hips highest
  const hipRise = hipBaseline - (apexFrame >= 0 ? hipY[apexFrame] : NaN);

  const base: PhaseResult = {
    ok: false,
    hipY,
    footY,
    rawHipY,
    rawFootY,
    groundBaseline: footBaseline,
    airborneThreshold: footBaseline,
    apexFrame,
    takeoffFrame: -1,
    landingFrame: -1,
    flightTimeS: 0,
    crossTakeoffFrame: -1,
    crossLandingFrame: -1,
    takeoffAgreement: -1,
    landingAgreement: -1,
  };

  if (!Number.isFinite(hipRise) || hipRise < MIN_JUMP_RANGE || apexFrame < 1 || apexFrame > N - 2) {
    return {
      ...base,
      message: 'No clear jump detected — the hips never rise enough. Make sure the whole body is in frame and the clip contains a real jump.',
    };
  }

  // PRIMARY: hip-velocity peaks around the apex.
  const mt = (i: number) => frames[i].mediaTime;
  const vel = new Array<number>(N).fill(0);
  for (let i = 1; i < N; i++) {
    const dt = mt(i) - mt(i - 1);
    vel[i] = dt > 0 ? (hipY[i] - hipY[i - 1]) / dt : 0;
  }
  const apexT = mt(apexFrame);
  const inWindow = (i: number) => Math.abs(mt(i) - apexT) <= SEARCH_WINDOW_S;

  // takeoff = strongest upward (most negative) velocity before the apex.
  let takeoffFrame = -1;
  let tv = Infinity;
  for (let i = 1; i < apexFrame; i++) {
    if (inWindow(i) && vel[i] < tv) {
      tv = vel[i];
      takeoffFrame = i;
    }
  }
  // landing = strongest downward (most positive) velocity after the apex.
  let landingFrame = -1;
  let lv = -Infinity;
  for (let i = apexFrame + 1; i < N; i++) {
    if (inWindow(i) && vel[i] > lv) {
      lv = vel[i];
      landingFrame = i;
    }
  }

  const flightTimeS =
    takeoffFrame >= 0 && landingFrame >= 0 ? Math.max(0, mt(landingFrame) - mt(takeoffFrame)) : 0;

  // CROSS-CHECK: foot baseline crossings around the apex.
  const mad = median(footY.map((v) => Math.abs(v - footBaseline)));
  const margin = Math.min(
    Math.max(GROUND_MARGIN_MAD_K * mad, GROUND_MARGIN_MIN),
    GROUND_MARGIN_MAX_FRACTION * Math.max(hipRise, 1e-6),
  );
  const airborneThreshold = footBaseline - margin;
  // Walk out from the apex while feet stay above the ground threshold (airborne).
  let crossTakeoffFrame = -1;
  let crossLandingFrame = -1;
  if (footY[apexFrame] < airborneThreshold) {
    let s = apexFrame;
    while (s > 0 && footY[s - 1] < airborneThreshold) s--;
    let e = apexFrame;
    while (e < N - 1 && footY[e + 1] < airborneThreshold) e++;
    crossTakeoffFrame = s;
    crossLandingFrame = Math.min(N - 1, e + 1);
  }
  const takeoffAgreement =
    crossTakeoffFrame >= 0 ? Math.abs(crossTakeoffFrame - takeoffFrame) : -1;
  const landingAgreement =
    crossLandingFrame >= 0 ? Math.abs(crossLandingFrame - landingFrame) : -1;

  return {
    ok: true,
    hipY,
    footY,
    rawHipY,
    rawFootY,
    groundBaseline: footBaseline,
    airborneThreshold,
    apexFrame,
    takeoffFrame,
    landingFrame,
    flightTimeS,
    crossTakeoffFrame,
    crossLandingFrame,
    takeoffAgreement,
    landingAgreement,
  };
}
