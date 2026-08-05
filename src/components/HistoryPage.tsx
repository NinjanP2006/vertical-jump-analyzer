import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { listJumps, deleteJump, type SavedJump } from '../api/jumps';
import './HistoryPage.css';

type Load = 'loading' | 'ready' | 'error';

const W = 640;
const H = 180;
const PAD = 28;

function ProgressChart({ jumps }: { jumps: SavedJump[] }) {
  // Oldest → newest so progress reads left to right.
  const ordered = [...jumps].reverse();
  if (ordered.length < 2) return null;

  const heights = ordered.map((j) => j.heightCm);
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const range = Math.max(1, max - min);
  const x = (i: number) => PAD + (i / (ordered.length - 1)) * (W - 2 * PAD);
  const y = (h: number) => PAD + (1 - (h - min) / range) * (H - 2 * PAD);

  const line = ordered
    .map((j, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(j.heightCm).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hist__chart" preserveAspectRatio="none">
      <line x1={PAD} y1={y(max)} x2={W - PAD} y2={y(max)} className="hist__grid" />
      <line x1={PAD} y1={y(min)} x2={W - PAD} y2={y(min)} className="hist__grid" />
      <text x={4} y={y(max) + 4} className="hist__axis">
        {max.toFixed(0)}
      </text>
      <text x={4} y={y(min) + 4} className="hist__axis">
        {min.toFixed(0)}
      </text>
      <path d={line} className="hist__line" />
      {ordered.map((j, i) => (
        <circle key={j.jumpId} cx={x(i)} cy={y(j.heightCm)} r={3} className="hist__dot" />
      ))}
    </svg>
  );
}

export function HistoryPage() {
  const { user, loading: authLoading, configured, login } = useAuth();
  const [jumps, setJumps] = useState<SavedJump[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    setLoad('loading');
    listJumps()
      .then((j) => {
        if (!cancelled) {
          setJumps(j);
          setLoad('ready');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoad('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const remove = async (jumpId: string) => {
    const prev = jumps;
    setJumps((j) => j.filter((x) => x.jumpId !== jumpId)); // optimistic
    try {
      await deleteJump(jumpId);
    } catch {
      setJumps(prev); // roll back on failure
    }
  };

  if (!configured) {
    return <p className="hist__empty">Accounts aren&apos;t enabled in this build.</p>;
  }
  if (authLoading) return <p className="hist__empty">…</p>;
  if (!user) {
    return (
      <div className="hist__empty">
        <p>Log in to see your saved jumps and track progress over time.</p>
        <button className="hist__login" onClick={login}>
          Log in / Sign up
        </button>
      </div>
    );
  }

  const best = jumps.reduce<SavedJump | null>(
    (b, j) => (b == null || j.heightCm > b.heightCm ? j : b),
    null,
  );

  return (
    <div className="hist">
      <h1 className="hist__title">Your jumps</h1>

      {load === 'loading' && <p className="hist__empty">Loading…</p>}
      {load === 'error' && <p className="hist__err">Couldn&apos;t load history: {error}</p>}

      {load === 'ready' && jumps.length === 0 && (
        <div className="hist__empty">
          <p>No saved jumps yet.</p>
          <Link className="hist__login" to="/analyze">
            Analyze a jump →
          </Link>
        </div>
      )}

      {load === 'ready' && jumps.length > 0 && (
        <>
          {best && (
            <div className="hist__best">
              <span className="hist__bestlabel">Personal best</span>
              <span className="hist__bestval">{best.heightCm.toFixed(1)} cm</span>
            </div>
          )}

          <ProgressChart jumps={jumps} />

          <ul className="hist__list">
            {jumps.map((j) => (
              <li key={j.jumpId} className="hist__row">
                <span className="hist__date">
                  {new Date(j.capturedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="hist__h">{j.heightCm.toFixed(1)} cm</span>
                <span className="hist__flight">{Math.round(j.flightTimeMs)} ms</span>
                <button className="hist__del" onClick={() => void remove(j.jumpId)} title="Delete">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
