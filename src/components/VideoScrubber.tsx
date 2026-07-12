import { useCallback, useEffect, useRef, useState } from 'react';
import { scanFrames, frameSeekTime, seekTo, isRvfcSupported, type FrameInfo } from '../pipeline/frames';
import './VideoScrubber.css';

type Status = 'idle' | 'scanning' | 'ready' | 'error';

export function VideoScrubber() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<FrameInfo[]>([]);
  const [effectiveFps, setEffectiveFps] = useState(0);
  const [dropped, setDropped] = useState(0);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');

  const show = useCallback(
    async (i: number) => {
      const video = videoRef.current;
      if (!video || frames.length === 0) return;
      const clamped = Math.max(0, Math.min(frames.length - 1, i));
      await seekTo(video, frameSeekTime(frames, clamped));
      setIndex(clamped);
    },
    [frames],
  );

  // Arrow keys step frames once a clip is ready.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (status !== 'ready') return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        void show(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        void show(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, index, show]);

  // Clean up object URL and any in-flight scan on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const video = videoRef.current;
    if (!file || !video) return;

    abortRef.current?.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);

    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setFileName(file.name);
    setFrames([]);
    setIndex(0);
    setProgress(0);
    setError('');
    setStatus('idle');
    video.src = url;

    if (!isRvfcSupported(video)) {
      setError('This browser does not support requestVideoFrameCallback. Use Chrome, Edge, or Safari.');
      setStatus('error');
      return;
    }

    // Wait for metadata (dimensions/duration) before scanning.
    await new Promise<void>((res) => {
      const onMeta = () => {
        video.removeEventListener('loadedmetadata', onMeta);
        res();
      };
      video.addEventListener('loadedmetadata', onMeta);
    });

    const ac = new AbortController();
    abortRef.current = ac;
    setStatus('scanning');
    try {
      const result = await scanFrames(video, setProgress, ac.signal);
      if (ac.signal.aborted) return;
      setFrames(result.frames);
      setEffectiveFps(result.effectiveFps);
      setDropped(result.droppedFrames);
      setStatus('ready');
      await seekTo(video, frameSeekTime(result.frames, 0));
      setIndex(0);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const current = frames[index];
  const prevDeltaMs =
    index > 0 && current ? (current.mediaTime - frames[index - 1].mediaTime) * 1000 : null;
  // Flag the display-refresh cap: capture clustered near ~60fps is the classic symptom.
  const displayCapped = status === 'ready' && effectiveFps > 0 && effectiveFps < 70;

  return (
    <div className="scrubber">
      <div className="scrubber__load">
        <label className="scrubber__file">
          <input type="file" accept="video/*" onChange={onFile} />
          <span>Choose a video…</span>
        </label>
        {fileName && <span className="scrubber__filename">{fileName}</span>}
      </div>

      <div className="scrubber__stage">
        <video ref={videoRef} className="scrubber__video" muted playsInline preload="auto" />
        {status === 'idle' && !fileName && (
          <div className="scrubber__placeholder">Load a clip to begin.</div>
        )}
        {status === 'scanning' && (
          <div className="scrubber__overlay">
            Indexing frames… {Math.round(progress * 100)}%
          </div>
        )}
        {status === 'error' && <div className="scrubber__overlay scrubber__overlay--error">{error}</div>}
      </div>

      {status === 'ready' && current && (
        <>
          <div className="scrubber__controls">
            <button onClick={() => void show(0)} disabled={index === 0} title="First frame">
              |◀
            </button>
            <button onClick={() => void show(index - 1)} disabled={index === 0} title="Previous frame (←)">
              ◀
            </button>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={index}
              onChange={(e) => void show(Number(e.target.value))}
            />
            <button
              onClick={() => void show(index + 1)}
              disabled={index === frames.length - 1}
              title="Next frame (→)"
            >
              ▶
            </button>
            <button
              onClick={() => void show(frames.length - 1)}
              disabled={index === frames.length - 1}
              title="Last frame"
            >
              ▶|
            </button>
          </div>

          <dl className="scrubber__stats">
            <div>
              <dt>Frame</dt>
              <dd>
                {index + 1} / {frames.length}
              </dd>
            </div>
            <div>
              <dt>mediaTime</dt>
              <dd>
                {current.mediaTime.toFixed(4)} s
                <span className="muted"> ({(current.mediaTime * 1000).toFixed(1)} ms)</span>
              </dd>
            </div>
            <div>
              <dt>Δ prev frame</dt>
              <dd>{prevDeltaMs === null ? '—' : `${prevDeltaMs.toFixed(1)} ms`}</dd>
            </div>
            <div>
              <dt>Effective fps</dt>
              <dd className={displayCapped ? 'warn' : undefined}>{effectiveFps.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Resolution</dt>
              <dd>
                {current.width}×{current.height}
              </dd>
            </div>
            <div>
              <dt>Dropped (scan)</dt>
              <dd className={dropped > 0 ? 'warn' : undefined}>{dropped}</dd>
            </div>
          </dl>

          {displayCapped && (
            <p className="scrubber__note">
              ⚠️ Effective fps ≈ {effectiveFps.toFixed(0)}. This is likely capped by your display
              refresh rate during real-time playback — the file may be higher fps than what rVFC
              surfaced here. Milestone 2 switches to seek/WebCodecs decoding to read every encoded
              frame regardless of monitor refresh.
            </p>
          )}
        </>
      )}
    </div>
  );
}
