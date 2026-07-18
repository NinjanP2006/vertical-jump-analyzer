// End-to-end single-clip pipeline (Milestone 4): load → scan frames → pose → detect phases →
// height. This is the shared code path used by the validation harness and, later, the product
// result flow — so what we validate is exactly what ships.

import { scanFrames } from './frames';
import { detectPhases, type PhaseResult } from './phases';
import type { PoseAnalyzer } from './pose';
import { jumpHeightFromFlightTime } from './height';

export interface ClipAnalysis {
  ok: boolean;
  message?: string;
  frameCount: number;
  effectiveFps: number;
  flightTimeS: number;
  heightCm: number;
  takeoffFrame: number;
  landingFrame: number;
  phase: PhaseResult;
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMeta = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('Video failed to load.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
  });
}

/**
 * Run the full pipeline on one clip using the given (already-created) video element and
 * pose analyzer. Caller owns the analyzer so a batch run can init the model once and reuse it.
 */
export async function analyzeClip(
  video: HTMLVideoElement,
  source: File | string,
  analyzer: PoseAnalyzer,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ClipAnalysis> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    video.src = url;
    await waitForMetadata(video);
    const scan = await scanFrames(video, undefined, signal);
    await analyzer.init();
    const poses = await analyzer.analyze(video, scan.frames, onProgress, signal);
    const phase = detectPhases(poses, scan.frames);
    const heightCm = phase.ok ? jumpHeightFromFlightTime(phase.flightTimeS).cm : NaN;
    return {
      ok: phase.ok,
      message: phase.message,
      frameCount: scan.frames.length,
      effectiveFps: scan.effectiveFps,
      flightTimeS: phase.flightTimeS,
      heightCm,
      takeoffFrame: phase.takeoffFrame,
      landingFrame: phase.landingFrame,
      phase,
    };
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  }
}
