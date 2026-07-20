import { useMemo, useRef, useState } from 'react';
import clipsData from '../../fixtures/clips.json';
import type { ClipFixture } from '../pipeline/types';
import { createPoseAnalyzer, type PoseAnalyzer } from '../pipeline/pose';
import { analyzeClip } from '../pipeline/analyzeClip';
import './ValidationPanel.css';

const fixtures = (clipsData as { clips: ClipFixture[] }).clips;

interface Row {
  status: 'pending' | 'running' | 'done' | 'nofile' | 'error';
  computedCm?: number;
  flightMs?: number;
  fps?: number;
  message?: string;
}

export function ValidationPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const analyzerRef = useRef<PoseAnalyzer | null>(null);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  // Match on lowercased names: clips.json often says .MOV while the file on disk is .mov.
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const map = new Map<string, File>();
    for (const f of Array.from(e.target.files ?? [])) map.set(f.name.toLowerCase(), f);
    setFiles(map);
    setRows({});
  };

  const runAll = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!analyzerRef.current) analyzerRef.current = createPoseAnalyzer();
    const analyzer = analyzerRef.current;
    setRunning(true);
    setProgress(0);

    for (let i = 0; i < fixtures.length; i++) {
      const fx = fixtures[i];
      const file = files.get(fx.file.toLowerCase());
      if (!file) {
        setRows((r) => ({ ...r, [fx.id]: { status: 'nofile' } }));
        continue;
      }
      setRows((r) => ({ ...r, [fx.id]: { status: 'running' } }));
      try {
        const res = await analyzeClip(video, file, analyzer);
        setRows((r) => ({
          ...r,
          [fx.id]: res.ok
            ? {
                status: 'done',
                computedCm: res.heightCm,
                flightMs: res.flightTimeS * 1000,
                fps: res.effectiveFps,
              }
            : { status: 'error', message: res.message },
        }));
      } catch (err) {
        setRows((r) => ({
          ...r,
          [fx.id]: { status: 'error', message: err instanceof Error ? err.message : String(err) },
        }));
      }
      setProgress((i + 1) / fixtures.length);
    }
    setRunning(false);
  };

  const summary = useMemo(() => {
    const errs: number[] = [];
    for (const fx of fixtures) {
      const row = rows[fx.id];
      if (row?.status === 'done' && fx.trueHeightCm > 0 && row.computedCm != null) {
        errs.push(Math.abs(row.computedCm - fx.trueHeightCm));
      }
    }
    if (errs.length === 0) return null;
    return {
      n: errs.length,
      mean: errs.reduce((a, b) => a + b, 0) / errs.length,
      max: Math.max(...errs),
      within2: errs.filter((e) => e <= 2).length,
    };
  }, [rows]);

  const matchedCount = fixtures.filter((fx) => files.has(fx.file.toLowerCase())).length;

  return (
    <div className="validation">
      <p className="validation__intro">
        Runs the exact product pipeline (MediaPipe → takeoff/landing → flight-time height) over the
        clips listed in <code>fixtures/clips.json</code> and compares against your measured heights.
        Select the matching video files below (they stay on your device).
      </p>

      <div className="validation__controls">
        <label className="validation__file">
          <input type="file" accept="video/*" multiple onChange={onFiles} />
          <span>Select fixture videos…</span>
        </label>
        <span className="validation__matched">
          {matchedCount}/{fixtures.length} clips matched
        </span>
        <button onClick={() => void runAll()} disabled={running || matchedCount === 0}>
          {running ? `Running… ${Math.round(progress * 100)}%` : 'Run validation'}
        </button>
      </div>

      {summary && (
        <div className={`validation__summary ${summary.max <= 2 ? 'ok' : 'warn'}`}>
          <strong>
            {summary.within2}/{summary.n}
          </strong>{' '}
          within ±2 cm · mean abs error <strong>{summary.mean.toFixed(2)} cm</strong> · max{' '}
          <strong>{summary.max.toFixed(2)} cm</strong>
        </div>
      )}

      <div className="validation__tablewrap">
        <table className="validation__table">
          <thead>
            <tr>
              <th>Clip</th>
              <th>True (cm)</th>
              <th>Computed (cm)</th>
              <th>Error (cm)</th>
              <th>Flight (ms)</th>
              <th>fps</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((fx) => {
              const row = rows[fx.id];
              const err =
                row?.status === 'done' && fx.trueHeightCm > 0 && row.computedCm != null
                  ? row.computedCm - fx.trueHeightCm
                  : null;
              const errClass = err == null ? '' : Math.abs(err) <= 2 ? 'good' : 'bad';
              return (
                <tr key={fx.id}>
                  <td>{fx.id}</td>
                  <td>{fx.trueHeightCm > 0 ? fx.trueHeightCm.toFixed(1) : '—'}</td>
                  <td>{row?.computedCm != null ? row.computedCm.toFixed(1) : '—'}</td>
                  <td className={errClass}>
                    {err != null ? `${err >= 0 ? '+' : ''}${err.toFixed(1)}` : '—'}
                  </td>
                  <td>{row?.flightMs != null ? Math.round(row.flightMs) : '—'}</td>
                  <td className={row?.fps != null && row.fps < 70 ? 'warn' : ''}>
                    {row?.fps != null ? row.fps.toFixed(0) : '—'}
                  </td>
                  <td>
                    {row?.status === 'nofile' && <span className="muted">no file</span>}
                    {row?.status === 'running' && 'running…'}
                    {row?.status === 'done' && <span className="good">ok</span>}
                    {row?.status === 'error' && (
                      <span className="bad" title={row.message}>
                        error
                      </span>
                    )}
                    {!row && <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Processing surface — small but visible so you can watch each clip run. */}
      <video ref={videoRef} className="validation__video" muted playsInline preload="auto" />
    </div>
  );
}
