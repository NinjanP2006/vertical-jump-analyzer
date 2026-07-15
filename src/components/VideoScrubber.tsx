import { useCallback, useEffect, useRef, useState } from 'react';
import { scanFrames, frameSeekTime, seekTo, isRvfcSupported, type FrameInfo } from '../pipeline/frames';
import { createPoseAnalyzer, type PoseAnalyzer } from '../pipeline/pose';
import { detectPhases, type PhaseResult } from '../pipeline/phases';
import type { FramePose, Landmark } from '../pipeline/types';
import { LM } from '../pipeline/landmarks';
import { PhaseChart } from './PhaseChart';
import './VideoScrubber.css';

type Status = 'idle' | 'scanning' | 'ready' | 'error';
type PoseStatus = 'none' | 'analyzing' | 'done' | 'error';

// Lower-body + torso skeleton connections (landmark index pairs) — enough to eyeball
// tracking of the hips and feet, which are what takeoff/landing detection relies on.
const CONNECTIONS: [number, number][] = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.LEFT_ANKLE, LM.LEFT_HEEL],
  [LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX],
  [LM.LEFT_ANKLE, LM.LEFT_FOOT_INDEX],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.RIGHT_ANKLE, LM.RIGHT_HEEL],
  [LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX],
  [LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX],
];

const VIS_THRESHOLD = 0.3;

function drawPose(canvas: HTMLCanvasElement, landmarks: Landmark[] | undefined) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks || landmarks.length === 0) return;

  const w = canvas.width;
  const h = canvas.height;
  const px = (lm: Landmark) => [lm.x * w, lm.y * h] as const;

  // Bones
  ctx.lineWidth = Math.max(2, w / 320);
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)';
  for (const [a, b] of CONNECTIONS) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 0) < VIS_THRESHOLD || (lb.visibility ?? 0) < VIS_THRESHOLD) continue;
    const [ax, ay] = px(la);
    const [bx, by] = px(lb);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // Feet points (highlighted — these drive takeoff/landing)
  const feet = [LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX];
  const r = Math.max(3, w / 180);
  for (const idx of feet) {
    const lm = landmarks[idx];
    if (!lm || (lm.visibility ?? 0) < VIS_THRESHOLD) continue;
    const [x, y] = px(lm);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f472b6';
    ctx.fill();
  }

  // Hip midpoint (center-of-mass proxy)
  const lh = landmarks[LM.LEFT_HIP];
  const rh = landmarks[LM.RIGHT_HIP];
  if (lh && rh) {
    const cx = ((lh.x + rh.x) / 2) * w;
    const cy = ((lh.y + rh.y) / 2) * h;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = '#34d399';
    ctx.fill();
  }
}

export function VideoScrubber() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const analyzerRef = useRef<PoseAnalyzer | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<FrameInfo[]>([]);
  const [effectiveFps, setEffectiveFps] = useState(0);
  const [dropped, setDropped] = useState(0);
  const [index, setIndex] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState('');

  const [poses, setPoses] = useState<FramePose[] | null>(null);
  const [phase, setPhase] = useState<PhaseResult | null>(null);
  const [poseStatus, setPoseStatus] = useState<PoseStatus>('none');
  const [poseStage, setPoseStage] = useState('');
  const [poseProgress, setPoseProgress] = useState(0);
  const [showOverlay, setShowOverlay] = useState(true);
  const [copied, setCopied] = useState(false);

  const copyDebug = async () => {
    if (!phase) return;
    const round = (v: number) => Math.round(v * 10000) / 10000;
    const payload = {
      clip: fileName,
      frameCount: frames.length,
      effectiveFps: round(effectiveFps),
      mediaTimes: frames.map((f) => round(f.mediaTime)),
      rawFootY: phase.rawFootY.map(round),
      rawHipY: phase.rawHipY.map(round),
      smoothFootY: phase.footY.map(round),
      smoothHipY: phase.hipY.map(round),
      groundBaseline: round(phase.groundBaseline),
      airborneThreshold: round(phase.airborneThreshold),
      apexFrame: phase.apexFrame,
      detected: {
        takeoffFrame: phase.takeoffFrame,
        landingFrame: phase.landingFrame,
        flightTimeMs: Math.round(phase.flightTimeS * 1000),
        crossTakeoffFrame: phase.crossTakeoffFrame,
        crossLandingFrame: phase.crossLandingFrame,
      },
    };
    await navigator.clipboard.writeText(JSON.stringify(payload));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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

  // Redraw the overlay whenever the frame, poses, or visibility toggle changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!showOverlay || !poses) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    drawPose(canvas, poses[index]?.landmarks);
  }, [index, poses, showOverlay, dims]);

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

  // Clean up object URL, scan, and worker on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      analyzerRef.current?.dispose();
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
    setPoses(null);
    setPhase(null);
    setPoseStatus('none');
    setDims(null);
    setStatus('idle');
    video.src = url;

    if (!isRvfcSupported(video)) {
      setError('This browser does not support requestVideoFrameCallback. Use Chrome, Edge, or Safari.');
      setStatus('error');
      return;
    }

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
      setDims({ w: video.videoWidth, h: video.videoHeight });
      setStatus('ready');
      await seekTo(video, frameSeekTime(result.frames, 0));
      setIndex(0);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const runPose = async () => {
    const video = videoRef.current;
    if (!video || frames.length === 0) return;
    if (!analyzerRef.current) analyzerRef.current = createPoseAnalyzer();
    const analyzer = analyzerRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    setPoseStatus('analyzing');
    setPoseProgress(0);
    setPoseStage('Starting…');
    setPoses(null);
    setPhase(null);
    try {
      await analyzer.init(setPoseStage);
      const result = await analyzer.analyze(video, frames, setPoseProgress, ac.signal);
      if (ac.signal.aborted) return;
      setPoses(result);
      setPhase(detectPhases(result, frames));
      setPoseStatus('done');
      await seekTo(video, frameSeekTime(frames, index));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setPoseStatus('error');
    }
  };

  const current = frames[index];
  const prevDeltaMs =
    index > 0 && current ? (current.mediaTime - frames[index - 1].mediaTime) * 1000 : null;
  const displayCapped = status === 'ready' && effectiveFps > 0 && effectiveFps < 70;
  const currentPose = poses?.[index];
  const hasPose = (currentPose?.landmarks.length ?? 0) > 0;
  const stageStyle = dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined;

  return (
    <div className="scrubber">
      <div className="scrubber__load">
        <label className="scrubber__file">
          <input type="file" accept="video/*" onChange={onFile} />
          <span>Choose a video…</span>
        </label>
        {fileName && <span className="scrubber__filename">{fileName}</span>}
      </div>

      <div className="scrubber__stage" style={stageStyle}>
        <video ref={videoRef} className="scrubber__video" muted playsInline preload="auto" />
        {dims && <canvas ref={canvasRef} className="scrubber__canvas" width={dims.w} height={dims.h} />}
        {status === 'idle' && !fileName && (
          <div className="scrubber__placeholder">Load a clip to begin.</div>
        )}
        {status === 'scanning' && (
          <div className="scrubber__overlay">Indexing frames… {Math.round(progress * 100)}%</div>
        )}
        {poseStatus === 'analyzing' && (
          <div className="scrubber__overlay">
            {poseProgress === 0 ? poseStage || 'Loading pose model…' : `Analyzing pose… ${Math.round(poseProgress * 100)}%`}
          </div>
        )}
        {(status === 'error' || poseStatus === 'error') && (
          <div className="scrubber__overlay scrubber__overlay--error">{error}</div>
        )}
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

          <div className="scrubber__actions">
            <button
              className="scrubber__analyze"
              onClick={() => void runPose()}
              disabled={poseStatus === 'analyzing'}
            >
              {poseStatus === 'done' ? 'Re-analyze pose' : 'Analyze pose'}
            </button>
            {poses && (
              <label className="scrubber__toggle">
                <input
                  type="checkbox"
                  checked={showOverlay}
                  onChange={(e) => setShowOverlay(e.target.checked)}
                />
                Show overlay
              </label>
            )}
            {poseStatus === 'done' && (
              <span className={hasPose ? 'scrubber__badge' : 'scrubber__badge warn'}>
                {hasPose ? 'pose detected' : 'no pose in this frame'}
              </span>
            )}
            {poseStatus === 'done' && poses && (
              <span className="scrubber__badge">
                {poses.filter((p) => p.landmarks.length > 0).length}/{poses.length} frames with pose
              </span>
            )}
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

          {phase && !phase.ok && (
            <p className="scrubber__note">⚠️ {phase.message}</p>
          )}

          {phase && phase.ok && (
            <div className="scrubber__phases">
              <div className="scrubber__phasehead">
                <div className="scrubber__flight">
                  <span className="scrubber__flightlabel">Flight time</span>
                  <span className="scrubber__flightval">{(phase.flightTimeS * 1000).toFixed(0)} ms</span>
                </div>
                <div className="scrubber__phasebtns">
                  <button onClick={() => void show(phase.takeoffFrame)}>
                    Go to takeoff (#{phase.takeoffFrame + 1})
                  </button>
                  <button onClick={() => void show(phase.landingFrame)}>
                    Go to landing (#{phase.landingFrame + 1})
                  </button>
                  <button onClick={() => void copyDebug()}>
                    {copied ? 'Copied ✓' : 'Copy debug data'}
                  </button>
                </div>
              </div>

              <PhaseChart phase={phase} currentIndex={index} onSeekFrame={(f) => void show(f)} />

              <p className="scrubber__crosscheck">
                Foot cross-check — takeoff {phase.takeoffAgreement < 0 ? 'n/a' : `±${phase.takeoffAgreement} frame(s)`},
                landing {phase.landingAgreement < 0 ? 'n/a' : `±${phase.landingAgreement} frame(s)`}.
                {(phase.takeoffAgreement > 3 || phase.landingAgreement > 3) && (
                  <span className="warn"> Hip &amp; foot methods disagree — expected on low-fps / noisy clips.</span>
                )}
              </p>
            </div>
          )}

          {displayCapped && (
            <p className="scrubber__note">
              ⚠️ Effective fps ≈ {effectiveFps.toFixed(0)}. This is likely capped by your display
              refresh rate during real-time playback — the file may be higher fps than what rVFC
              surfaced here. Milestone 2 pose runs seek-based so it is unaffected, but full
              frame-accurate timing will move to WebCodecs later.
            </p>
          )}
        </>
      )}
    </div>
  );
}
