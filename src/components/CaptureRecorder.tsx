import { useCallback, useEffect, useRef, useState } from 'react';
import { createPoseAnalyzer, type PoseAnalyzer } from '../pipeline/pose';
import { REQUIRED_LANDMARKS } from '../pipeline/landmarks';
import './CaptureRecorder.css';

// Guided capture (Milestone 6). Input quality dominates result quality, so this exists to make
// a good clip the default: request a high frame rate, show a framing guide, and check the whole
// body (feet included) is actually visible BEFORE the athlete jumps — not after.

const VIS = 0.3;
const TARGET_FPS = 60;

interface Props {
  onRecorded: (file: File) => void;
  onCancel: () => void;
}

type Framing = 'unknown' | 'ok' | 'partial' | 'none';

export function CaptureRecorder({ onRecorded, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const analyzerRef = useRef<PoseAnalyzer | null>(null);
  const rafRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [actualFps, setActualFps] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [framing, setFraming] = useState<Framing>('unknown');

  const stopStream = useCallback(() => {
    if (rafRef.current !== null) window.clearTimeout(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      analyzerRef.current?.dispose();
    };
  }, [stopStream]);

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          frameRate: { ideal: TARGET_FPS, min: 30 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const settings = stream.getVideoTracks()[0]?.getSettings();
      setActualFps(settings?.frameRate ? Math.round(settings.frameRate) : null);
      setReady(true);

      // Live framing feedback. Deliberately low-rate (~3/s) so it never competes with capture.
      if (!analyzerRef.current) analyzerRef.current = createPoseAnalyzer();
      await analyzerRef.current.init();
      const tick = () => {
        const a = analyzerRef.current;
        const v = videoRef.current;
        if (a && v && v.readyState >= 2) {
          const pose = a.detectFrame(v, performance.now());
          if (!pose || pose.landmarks.length === 0) setFraming('none');
          else {
            const allVisible = REQUIRED_LANDMARKS.every(
              (i) => (pose.landmarks[i]?.visibility ?? 0) >= VIS,
            );
            setFraming(allVisible ? 'ok' : 'partial');
          }
        }
        rafRef.current = window.setTimeout(tick, 330);
      };
      tick();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Camera unavailable: ${err.message}`
          : 'Camera unavailable. Check browser permissions.',
      );
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const file = new File([blob], `jump-${Date.now()}.webm`, { type: mime });
      stopStream();
      onRecorded(file);
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const fpsLow = actualFps != null && actualFps < TARGET_FPS;

  return (
    <div className="cap">
      <div className="cap__stage">
        <video ref={videoRef} className="cap__video" muted playsInline />
        {/* Framing guide: keep the whole body, feet included, inside the box. */}
        <div className={`cap__guide cap__guide--${framing}`} />
        {!ready && !error && (
          <div className="cap__overlay">
            <button className="cap__start" onClick={() => void start()}>
              Enable camera
            </button>
          </div>
        )}
        {error && <div className="cap__overlay cap__overlay--error">{error}</div>}
      </div>

      {ready && (
        <>
          <div className="cap__status">
            <span className={`cap__badge cap__badge--${framing}`}>
              {framing === 'ok' && '✓ Full body in frame'}
              {framing === 'partial' && '⚠ Feet or lower body not visible'}
              {framing === 'none' && '⚠ No one detected'}
              {framing === 'unknown' && 'Checking framing…'}
            </span>
            <span className={`cap__badge ${fpsLow ? 'cap__badge--partial' : 'cap__badge--ok'}`}>
              {actualFps ? `${actualFps} fps` : 'fps unknown'}
            </span>
          </div>

          {fpsLow && (
            <p className="cap__note">
              This camera is capturing at {actualFps} fps. Height accuracy depends on frame timing —
              at {actualFps} fps each frame is {(1000 / (actualFps || 30)).toFixed(0)} ms. If your
              phone can record 60 fps, filming there and uploading will be more accurate.
            </p>
          )}

          <div className="cap__controls">
            {!recording ? (
              <button className="cap__rec" onClick={startRecording}>
                Start recording
              </button>
            ) : (
              <button className="cap__stop" onClick={stopRecording}>
                Stop &amp; analyze
              </button>
            )}
            <button
              className="cap__cancel"
              onClick={() => {
                stopStream();
                onCancel();
              }}
            >
              Cancel
            </button>
          </div>

          <ul className="cap__tips">
            <li>Stand side-on to the camera, whole body inside the guide</li>
            <li>Keep the camera still — prop it up or have someone hold it steady</li>
            <li>Start recording, jump once, then stop</li>
          </ul>
        </>
      )}
    </div>
  );
}
