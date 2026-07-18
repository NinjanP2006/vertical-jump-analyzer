// Pre-result input validation (Milestone 5).
//
// Bad input is the #1 real-world failure mode: portrait video, body out of frame, poor light,
// low frame rate. The rule is to TELL the athlete rather than silently return a wrong number —
// a confidently-wrong height destroys trust far faster than an honest warning.

import { REQUIRED_LANDMARKS } from './landmarks';
import type { FramePose } from './types';

const VIS = 0.3;

export interface InputWarning {
  id: string;
  severity: 'warn' | 'info';
  text: string;
}

export function checkInput(
  poses: FramePose[],
  effectiveFps: number,
  videoWidth: number,
  videoHeight: number,
): InputWarning[] {
  const warnings: InputWarning[] = [];

  if (effectiveFps > 0 && effectiveFps < 50) {
    warnings.push({
      id: 'fps',
      severity: 'warn',
      text: `Low frame rate (~${effectiveFps.toFixed(0)} fps — each frame is ${(1000 / effectiveFps).toFixed(0)} ms). Timing error grows with frame duration; record at 60 fps for a more accurate height.`,
    });
  }

  if (videoWidth > 0 && videoHeight > videoWidth) {
    warnings.push({
      id: 'portrait',
      severity: 'warn',
      text: 'Portrait video. Film in landscape so the whole body stays in frame through the jump.',
    });
  }

  const total = poses.length;
  const detected = poses.filter((p) => p.landmarks.length > 0).length;
  if (total > 0 && detected < total * 0.8) {
    warnings.push({
      id: 'tracking',
      severity: 'warn',
      text: `A pose was only found in ${Math.round((detected / total) * 100)}% of frames. Improve lighting and keep the athlete fully visible.`,
    });
  }

  let fullBody = 0;
  for (const p of poses) {
    if (p.landmarks.length === 0) continue;
    const ok = REQUIRED_LANDMARKS.every((i) => (p.landmarks[i]?.visibility ?? 0) >= VIS);
    if (ok) fullBody++;
  }
  if (detected > 0 && fullBody < detected * 0.7) {
    warnings.push({
      id: 'body',
      severity: 'warn',
      text: 'The lower body/feet were not consistently visible. Takeoff and landing depend on the feet — keep the whole body, including feet, in frame.',
    });
  }

  return warnings;
}
