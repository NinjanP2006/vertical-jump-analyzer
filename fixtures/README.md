# Ground-truth clips

These clips are the reference the whole pipeline is validated against. If the app ever
reports a height that disagrees with reality, it fails here first — so invest in good clips.

## How to film a good ground-truth clip

- **Side-on**, camera perpendicular to the direction the athlete faces. Whole body in frame
  before, during, and after the jump (feet must stay visible at the bottom of the load and
  the top of the flight).
- **High frame rate**: 120fps slow-mo if your phone supports it, 60fps minimum. Higher fps =
  smaller timing error on takeoff/landing = more accurate height.
- **Stable camera** (tripod or propped), landscape orientation, decent even lighting.
- Keep the clip short — a second or two of lead-in, the jump, a second of landing.

## Get a real ground-truth number for each clip

Pick one and be consistent:
- **Wall reach delta**: standing reach mark vs. jump-touch mark on a wall. Height = difference.
- **Jump mat** (contact mat): reads flight-time height directly.
- **Vertec**: highest vane tapped minus standing reach.

## Logging clips

1. Drop the video file in this folder (video files are git-ignored — only `clips.json` is committed).
2. Add an entry to `clips.json`:

```json
{
  "id": "niranjan-001",
  "file": "niranjan-001.mp4",
  "trueHeightCm": 61.0,
  "athlete": "niranjan",
  "capturedFps": 120,
  "referenceMethod": "wall-reach",
  "notes": "good lighting, clean side view"
}
```

Aim for 5–10 clips spanning a range of heights and, ideally, a couple of different athletes.
