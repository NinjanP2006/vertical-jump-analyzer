// Frame extraction primitives (Milestone 1).
//
// scanFrames() plays a video through once and records the true presentation timestamp
// (mediaTime) of every frame the browser composites, via requestVideoFrameCallback.
//
// IMPORTANT caveat that shapes accuracy: rVFC fires once per frame sent to the display
// compositor. During real-time playback on a 60 Hz monitor, a 120 fps clip only surfaces
// ~60 callbacks/sec — you lose half your timing resolution. We surface the *effective* fps
// we actually captured (below) so this is visible, not silent. Full frame-accurate
// extraction (Milestone 2) will move to seek-based / WebCodecs decoding to guarantee every
// encoded frame regardless of display refresh rate.

export interface FrameInfo {
  index: number;
  /** Presentation timestamp of this frame in seconds. Source of truth for timing. */
  mediaTime: number;
  width: number;
  height: number;
}

export interface ScanResult {
  frames: FrameInfo[];
  /** 1 / median(inter-frame dt). The fps we actually captured (may be display-capped). */
  effectiveFps: number;
  /** Frames the compositor dropped during the scan (gaps in presentedFrames counter). */
  droppedFrames: number;
}

export function isRvfcSupported(video: HTMLVideoElement): boolean {
  return typeof video.requestVideoFrameCallback === 'function';
}

/**
 * Play `video` from the start to the end, capturing every composited frame's mediaTime.
 * Resolves with the full frame index. Rejects on decode error or abort.
 */
export async function scanFrames(
  video: HTMLVideoElement,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ScanResult> {
  if (!isRvfcSupported(video)) {
    throw new Error('requestVideoFrameCallback is not supported in this browser.');
  }

  video.muted = true; // required for programmatic play() under autoplay policies
  video.playsInline = true;

  const frames: FrameInfo[] = [];
  let firstPresented = -1;
  let lastPresented = -1;

  return new Promise<ScanResult>((resolve, reject) => {
    let handle = 0;

    const cleanup = () => {
      video.cancelVideoFrameCallback(handle);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      video.pause();
    };

    const onFrame: VideoFrameRequestCallback = (_now, meta) => {
      if (firstPresented < 0) firstPresented = meta.presentedFrames;
      lastPresented = meta.presentedFrames;
      frames.push({
        index: frames.length,
        mediaTime: meta.mediaTime,
        width: meta.width,
        height: meta.height,
      });
      if (video.duration > 0) {
        onProgress?.(Math.min(1, meta.mediaTime / video.duration));
      }
      handle = video.requestVideoFrameCallback(onFrame);
    };

    const onEnded = () => {
      cleanup();
      const deltas: number[] = [];
      for (let i = 1; i < frames.length; i++) {
        deltas.push(frames[i].mediaTime - frames[i - 1].mediaTime);
      }
      const med = median(deltas);
      const effectiveFps = med > 0 ? 1 / med : 0;
      const expectedSpan = frames.length - 1;
      const actualSpan = lastPresented - firstPresented;
      const droppedFrames = Math.max(0, actualSpan - expectedSpan);
      resolve({ frames, effectiveFps, droppedFrames });
    };

    const onError = () => {
      cleanup();
      reject(new Error('Video failed to load or decode.'));
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Scan aborted', 'AbortError'));
    };

    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);

    handle = video.requestVideoFrameCallback(onFrame);
    video.play().catch((err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/**
 * Where to seek to land squarely inside frame `index`'s display interval. Seeking to the
 * exact mediaTime can round onto the previous frame, so we aim at the midpoint to the next.
 */
export function frameSeekTime(frames: FrameInfo[], index: number): number {
  const f = frames[index];
  const next = frames[index + 1];
  if (next) return (f.mediaTime + next.mediaTime) / 2;
  const prev = frames[index - 1];
  const gap = prev ? f.mediaTime - prev.mediaTime : 0.001;
  return f.mediaTime + gap / 2;
}

/** Seek `video` to `time` (seconds), resolving once the frame is displayed. */
export function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
