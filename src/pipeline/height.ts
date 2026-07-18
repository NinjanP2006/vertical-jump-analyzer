// Jump height from flight time (Milestone 4).
//
// For an airborne athlete gravity is the only force, so the rise and fall take equal time.
// With total airborne time t: height = g · t² / 8 (g = 9.81 m/s²). Needs only the two clean
// takeoff/landing frames and NO pixel-to-distance calibration — which is exactly why the whole
// product measures time in the air rather than displacement in pixels.

export const G = 9.81;

export interface JumpHeight {
  meters: number;
  cm: number;
  inches: number;
}

export function jumpHeightFromFlightTime(flightTimeS: number): JumpHeight {
  const meters = Math.max(0, (G * flightTimeS * flightTimeS) / 8);
  return { meters, cm: meters * 100, inches: meters * 39.3701 };
}

export function formatHeight(h: JumpHeight): string {
  return `${h.cm.toFixed(1)} cm · ${h.inches.toFixed(1)} in`;
}
