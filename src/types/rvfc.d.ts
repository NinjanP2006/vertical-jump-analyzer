// Ambient types for HTMLVideoElement.requestVideoFrameCallback (rVFC).
// These are not in TypeScript's default lib.dom.d.ts as of TS 5.6, but the API is
// supported in Chrome/Edge/Safari. rVFC is the foundation of Milestone 1: it gives us
// the exact presentation timestamp (mediaTime) of each decoded frame, which is what we
// derive flight time from — never an assumed constant fps.

interface VideoFrameCallbackMetadata {
  presentationTime: DOMHighResTimeStamp;
  expectedDisplayTime: DOMHighResTimeStamp;
  width: number;
  height: number;
  /** Media presentation timestamp (seconds) of the frame. Use THIS for flight time. */
  mediaTime: number;
  /** Count of frames submitted for composition; useful for detecting dropped frames. */
  presentedFrames: number;
  processingDuration?: number;
}

type VideoFrameRequestCallback = (
  now: DOMHighResTimeStamp,
  metadata: VideoFrameCallbackMetadata,
) => void;

interface HTMLVideoElement {
  requestVideoFrameCallback(callback: VideoFrameRequestCallback): number;
  cancelVideoFrameCallback(handle: number): void;
}
