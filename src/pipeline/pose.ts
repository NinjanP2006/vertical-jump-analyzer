// Pose estimation controller (Milestone 2).
//
// Runs MediaPipe Pose Landmarker on the MAIN THREAD. We originally targeted a Web Worker,
// but MediaPipe + Vite fought us on both worker flavors: a module worker throws
// "ModuleFactory not set" (MediaPipe loads its WASM glue via importScripts, unavailable in
// module workers), and a classic worker won't start under Vite's dev server with heavy npm
// deps. Main-thread inference is the reliable path and how most MediaPipe web demos run.
//
// Processing is seek-based and sequential (seek → detect → next), and we yield to the event
// loop between frames, so the progress bar and overlay stay responsive despite the per-frame
// (~30–80ms) synchronous detect. A worker can return later as a pure optimization.
//
// WASM runtime + model load from CDN at runtime — the athlete's video never leaves the
// device; only these static model assets are fetched.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { frameSeekTime, seekTo, type FrameInfo } from './frames';
import type { FramePose } from './types';

const TASKS_VISION_VERSION = '0.10.35';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

export interface PoseAnalyzer {
  init(onStatus?: (stage: string) => void): Promise<void>;
  analyze(
    video: HTMLVideoElement,
    frames: FrameInfo[],
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<FramePose[]>;
  dispose(): void;
}

export function createPoseAnalyzer(): PoseAnalyzer {
  let landmarker: PoseLandmarker | null = null;

  return {
    async init(onStatus) {
      if (landmarker) {
        onStatus?.('Model ready');
        return;
      }
      onStatus?.('Downloading runtime (~11 MB)…');
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      try {
        onStatus?.('Downloading model (~9 MB, GPU)…');
        landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      } catch {
        onStatus?.('GPU unavailable — loading on CPU…');
        landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      }
      onStatus?.('Model ready');
    },

    async analyze(video, frames, onProgress, signal) {
      if (!landmarker) throw new Error('Pose analyzer not initialized — call init() first.');
      // detectForVideo requires strictly increasing timestamps; guard against ties/rounding.
      let lastTs = -1;
      const poses: FramePose[] = [];
      for (let i = 0; i < frames.length; i++) {
        if (signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError');
        const f = frames[i];
        await seekTo(video, frameSeekTime(frames, i));
        let ts = Math.round(f.mediaTime * 1000);
        if (ts <= lastTs) ts = lastTs + 1;
        lastTs = ts;
        const result = landmarker.detectForVideo(video, ts);
        const lm = result.landmarks?.[0] ?? [];
        poses.push({
          frameIndex: i,
          mediaTime: f.mediaTime,
          landmarks: lm.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z ?? 0,
            visibility: p.visibility ?? 0,
          })),
        });
        onProgress?.((i + 1) / frames.length);
        // Yield so React can paint progress and the UI stays responsive between frames.
        await new Promise((r) => setTimeout(r, 0));
      }
      return poses;
    },

    dispose() {
      landmarker?.close();
      landmarker = null;
    },
  };
}
