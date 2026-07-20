# Vertical Jump Analyzer

Measure your vertical jump from a video, entirely in the browser. Upload or record a clip of a
jump and get your vertical in centimetres, along with the takeoff and landing frames the
measurement came from.

Height is calculated from time in the air (`h = g·t²/8`) rather than from pixels, so no reference
object or calibration is needed in the shot — just two clean frames. Pose estimation runs
on-device with MediaPipe, so your video never leaves your device and there's no backend.

> **Note:** accuracy has so far only been validated against a single measured jump (+1.0 cm error).
> Validate against your own measured jumps before trusting the numbers.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

## Tech stack

- **React 18** + **TypeScript**
- **Vite 5** — build tooling and dev server
- **React Router 6** — routing
- **MediaPipe Tasks Vision** — Pose Landmarker (Full model) for on-device body tracking
- **`requestVideoFrameCallback`** — frame-accurate video timing
