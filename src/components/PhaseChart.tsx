import type { PhaseResult } from '../pipeline/phases';
import './PhaseChart.css';

const W = 600;
const H = 160;

interface Props {
  phase: PhaseResult;
  currentIndex: number;
  onSeekFrame: (frame: number) => void;
}

// Vertical trajectories of feet (pink) and hip midpoint (green) over frames, with the ground
// baseline, airborne threshold, and detected takeoff/landing marked. y is plotted as-is
// (image coords: ground sits near the bottom), so "up" in the jump reads as up in the chart.
export function PhaseChart({ phase, currentIndex, onSeekFrame }: Props) {
  const n = phase.footY.length;
  if (n < 2) return null;

  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => Math.max(0, Math.min(1, v)) * H;

  const path = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeekFrame(Math.round(frac * (n - 1)));
  };

  return (
    <div className="phasechart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="phasechart__svg"
        onClick={handleClick}
      >
        {/* ground baseline + airborne threshold */}
        <line
          x1={0}
          x2={W}
          y1={y(phase.groundBaseline)}
          y2={y(phase.groundBaseline)}
          className="pc-baseline"
        />
        <line
          x1={0}
          x2={W}
          y1={y(phase.airborneThreshold)}
          y2={y(phase.airborneThreshold)}
          className="pc-threshold"
        />

        {/* takeoff / landing verticals */}
        {phase.takeoffFrame >= 0 && (
          <line
            x1={x(phase.takeoffFrame)}
            x2={x(phase.takeoffFrame)}
            y1={0}
            y2={H}
            className="pc-takeoff"
          />
        )}
        {phase.landingFrame >= 0 && (
          <line
            x1={x(phase.landingFrame)}
            x2={x(phase.landingFrame)}
            y1={0}
            y2={H}
            className="pc-landing"
          />
        )}

        {/* foot cross-check ticks (on the feet trajectory) */}
        {phase.crossTakeoffFrame >= 0 && (
          <circle
            cx={x(phase.crossTakeoffFrame)}
            cy={y(phase.footY[phase.crossTakeoffFrame])}
            r={3}
            className="pc-com"
          />
        )}
        {phase.crossLandingFrame >= 0 && (
          <circle
            cx={x(phase.crossLandingFrame)}
            cy={y(phase.footY[phase.crossLandingFrame])}
            r={3}
            className="pc-com"
          />
        )}

        {/* trajectories */}
        <path d={path(phase.footY)} className="pc-foot" />
        <path d={path(phase.hipY)} className="pc-hip" />

        {/* current frame */}
        <line x1={x(currentIndex)} x2={x(currentIndex)} y1={0} y2={H} className="pc-current" />
      </svg>
      <div className="phasechart__legend">
        <span className="pc-lg pc-lg--foot">feet</span>
        <span className="pc-lg pc-lg--hip">hip</span>
        <span className="pc-lg pc-lg--takeoff">takeoff</span>
        <span className="pc-lg pc-lg--landing">landing</span>
        <span className="pc-lg pc-lg--com">foot check</span>
        <span className="phasechart__hint">click to seek</span>
      </div>
    </div>
  );
}
