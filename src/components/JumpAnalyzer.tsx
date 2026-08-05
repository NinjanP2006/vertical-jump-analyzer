import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPoseAnalyzer, type PoseAnalyzer } from '../pipeline/pose';
import { analyzeClip, type ClipAnalysis } from '../pipeline/analyzeClip';
import { checkInput, type InputWarning } from '../pipeline/inputChecks';
import { jumpHeightFromFlightTime } from '../pipeline/height';
import { frameSeekTime, seekTo } from '../pipeline/frames';
import { useAuth } from '../auth/useAuth';
import { saveJump } from '../api/jumps';
import { CaptureRecorder } from './CaptureRecorder';
import './JumpAnalyzer.css';

type Stage = 'idle' | 'capture' | 'analyzing' | 'result' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function JumpAnalyzer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const analyzerRef = useRef<PoseAnalyzer | null>(null);
  const urlRef = useRef<string | null>(null);

  const [stage, setStage] = useState<Stage>('idle');
  const [statusText, setStatusText] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ClipAnalysis | null>(null);
  const [warnings, setWarnings] = useState<InputWarning[]>([]);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const { user, configured } = useAuth();

  useEffect(() => {
    return () => {
      analyzerRef.current?.dispose();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const run = async (file: File) => {
    const video = videoRef.current;
    if (!video) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    // We own the object URL so the clip stays playable for the replay afterwards.
    const url = URL.createObjectURL(file);
    urlRef.current = url;

    setStage('analyzing');
    setProgress(0);
    setError('');
    setResult(null);
    setWarnings([]);
    setSaveState('idle');
    setSaveError('');
    setStatusText('Loading pose model…');

    if (!analyzerRef.current) analyzerRef.current = createPoseAnalyzer();
    const analyzer = analyzerRef.current;

    try {
      await analyzer.init(setStatusText);
      setStatusText('Analyzing jump…');
      const res = await analyzeClip(video, url, analyzer, setProgress);
      setResult(res);
      setWarnings(checkInput(res.poses, res.effectiveFps, res.videoWidth, res.videoHeight));
      setStage('result');
      if (res.ok) await seekTo(video, frameSeekTime(res.frames, res.takeoffFrame));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('error');
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void run(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('video/')) void run(f);
  };

  const goToFrame = async (frame: number) => {
    const video = videoRef.current;
    if (!video || !result) return;
    await seekTo(video, frameSeekTime(result.frames, frame));
  };

  const reset = () => {
    setStage('idle');
    setResult(null);
    setWarnings([]);
    setError('');
    setSaveState('idle');
  };

  const save = async () => {
    if (!result?.ok) return;
    setSaveState('saving');
    setSaveError('');
    try {
      await saveJump({
        heightCm: Math.round(height!.cm * 10) / 10,
        flightTimeMs: Math.round(result.flightTimeS * 1000),
        fps: result.effectiveFps ? Math.round(result.effectiveFps) : null,
        capturedAt: new Date().toISOString(),
      });
      setSaveState('saved');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaveState('error');
    }
  };

  const height = result?.ok ? jumpHeightFromFlightTime(result.flightTimeS) : null;

  return (
    <div className="ja">
      {stage === 'idle' && (
        <div
          className={`ja__drop ${dragging ? 'ja__drop--over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="ja__droptitle">Drop a jump video here</p>
          <label className="ja__pick">
            <input type="file" accept="video/*" onChange={onPick} />
            <span>or choose a file</span>
          </label>
          <ul className="ja__tips">
            <li>Film side-on, whole body (including feet) in frame</li>
            <li>Landscape, steady camera, good lighting</li>
            <li>60 fps normal video — not slow-motion</li>
          </ul>
          <button className="ja__record" onClick={() => setStage('capture')}>
            Or record with your camera
          </button>
        </div>
      )}

      {stage === 'capture' && (
        <CaptureRecorder onRecorded={(f) => void run(f)} onCancel={() => setStage('idle')} />
      )}

      {stage === 'analyzing' && (
        <div className="ja__busy">
          <div className="ja__spinner" />
          <p>{progress > 0 ? `Analyzing jump… ${Math.round(progress * 100)}%` : statusText}</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="ja__error">
          <p>{error}</p>
          <button onClick={reset}>Try another clip</button>
        </div>
      )}

      {stage === 'result' && result && (
        <div className="ja__result">
          {result.ok && height ? (
            <div className="ja__hero">
              <span className="ja__herolabel">Jump height</span>
              <span className="ja__heroval">
                {height.cm.toFixed(1)}
                <small>cm</small>
              </span>
              <span className="ja__herosub">
                {height.inches.toFixed(1)} in · {(result.flightTimeS * 1000).toFixed(0)} ms in the
                air
              </span>
            </div>
          ) : (
            <div className="ja__nojump">
              <strong>Couldn&apos;t measure this jump.</strong>
              <p>{result.message ?? 'No clear jump detected.'}</p>
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="ja__warnings">
              {warnings.map((w) => (
                <li key={w.id}>⚠️ {w.text}</li>
              ))}
            </ul>
          )}

          {result.ok && (
            <p className="ja__explain">
              Height is measured from time in the air: <code>h = g·t²/8</code>. Check the two frames
              below — if they show the feet leaving and touching the ground, the number is sound.
            </p>
          )}

          {result.ok && configured && (
            <div className="ja__save">
              {!user ? (
                <span className="ja__savehint">Log in to save this jump to your history.</span>
              ) : saveState === 'saved' ? (
                <span className="ja__savedok">
                  ✓ Saved. <Link to="/history">View history →</Link>
                </span>
              ) : (
                <>
                  <button onClick={() => void save()} disabled={saveState === 'saving'}>
                    {saveState === 'saving' ? 'Saving…' : 'Save to my history'}
                  </button>
                  {saveState === 'error' && <span className="ja__saveerr">{saveError}</span>}
                </>
              )}
            </div>
          )}

          <div className="ja__frames">
            <button onClick={() => void goToFrame(result.takeoffFrame)} disabled={!result.ok}>
              Takeoff frame
            </button>
            <button onClick={() => void goToFrame(result.landingFrame)} disabled={!result.ok}>
              Landing frame
            </button>
            <button onClick={() => void videoRef.current?.play()}>Play clip</button>
            <button className="ja__again" onClick={reset}>
              Analyze another
            </button>
          </div>
        </div>
      )}

      {/* Shared surface: used for processing, then as the replay. Hidden until there's a clip. */}
      <video
        ref={videoRef}
        className={`ja__video ${stage === 'idle' || stage === 'capture' ? 'ja__video--hidden' : ''}`}
        muted
        playsInline
        preload="auto"
        controls={stage === 'result'}
      />
    </div>
  );
}
