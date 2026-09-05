# Vertical Jump Analyzer

Measure your vertical jump from a video, entirely in the browser. Upload or record a clip of a
jump and get your vertical in centimeters and inches, along with the takeoff and landing frames the measurement came from.

Height is calculated from time in the air (`h = g·t²/8`) rather than from pixels, so no reference
object or calibration is needed in the shot. Pose estimation runs on-device with MediaPipe, so your video never leaves your device.

## Tech stack

- **React 18** + **TypeScript**
- **Vite 5** — build tooling and dev server
- **React Router 6** — routing
- **MediaPipe Tasks Vision** — Pose Landmarker (Full model) for on-device body tracking
- **`requestVideoFrameCallback`** — frame-accurate video timing

Link: https://vertical-jump-analyzer.vercel.app/

