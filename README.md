# Vertical Jump Analyzer

Measure a vertical jump from a video, entirely in the browser. Upload or record a clip and get a
jump height in centimetres.

**The athlete's video never leaves their device.** Pose estimation runs on-device via MediaPipe;
only the static model files are fetched from a CDN. No backend, no accounts, no uploads.

## How it works

Height is measured from **time in the air**, not from pixels:

```
height = g · t² / 8        (g = 9.81 m/s²)
```

While airborne, gravity is the only force, so the rise and fall take equal time. This needs only
two clean frames — takeoff and landing — and **no pixel-to-distance calibration**, which is what
makes it practical without a reference object in frame.

The pipeline (`src/pipeline/`):

| Stage | File | What it does |
|---|---|---|
| Frame timing | `frames.ts` | Indexes each frame's true `mediaTime` via `requestVideoFrameCallback` |
| Pose | `pose.ts` | MediaPipe Pose Landmarker, seek-based frame-by-frame |
| Detection | `phases.ts` | Finds takeoff & landing from vertical hip/feet motion |
| Height | `height.ts` | Applies `g·t²/8` |
| Orchestration | `analyzeClip.ts` | Shared end-to-end path used by the app *and* the validation harness |
| Input QA | `inputChecks.ts` | Warns on low fps, portrait, poor tracking, feet out of frame |

**Frame rate is the dominant accuracy lever.** At 30 fps a frame is ~33 ms, so a one-frame error is
roughly ±1.3 cm; at 60 fps it halves. Record at 60 fps in normal video mode — *not* slow-motion,
which bakes a slowed time-base into the file and would inflate the measured flight time.

## Accuracy status

⚠️ **Validated on one clip only.** Against a measured 33.0 cm jump (60 fps, wall-reach reference)
the app computes 34.0 cm — a +1.0 cm error, inside the ±2 cm target. That is a single data point
and does not yet establish general accuracy. More measured clips are needed, particularly at a
different frame rate and a different jump height.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run typecheck
npm run lint
npm run format
```

Three tabs:

- **Analyze** — the product flow: upload or record, get a height.
- **Dev scrubber** — step frame-by-frame, inspect the pose overlay and the takeoff/landing
  trajectory chart. The debugging microscope.
- **Validation** — runs the real pipeline over the clips in `fixtures/clips.json` and tables
  computed height against measured ground truth.

## Validating accuracy

1. Film jumps side-on at 60 fps next to a known measurement (wall-reach mark, jump mat, Vertec).
2. Add an entry per clip to `fixtures/clips.json` with the measured `trueHeightCm`.
3. Open the **Validation** tab, select the video files (they stay local — only `clips.json` is
   committed), and run. The error column is the source of truth.

See `fixtures/README.md` for filming guidance.

## Deploying

The app is fully static — no server, no environment variables.

```bash
npm run build      # outputs to dist/
```

Deploy `dist/` to any static host. With Vercel / Netlify / Cloudflare Pages, connect the GitHub
repo and use:

- **Build command:** `npm run build`
- **Output directory:** `dist`

## Scope

This is the height-only MVP. Form analysis (countermovement depth, coaching cues, joint angles),
front-view analysis, accounts and jump history are deliberately out of scope.

## Stack

React 18 · TypeScript · Vite 5 · MediaPipe Tasks Vision (Pose Landmarker, Full model)
