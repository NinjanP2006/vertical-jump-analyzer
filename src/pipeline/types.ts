// Shared domain types for the analysis pipeline (Milestones 2–5).
// Data flows: PoseSequence -> PhaseSegmentation -> JumpMetrics -> Feedback.

// IMPORTANT coordinate convention: MediaPipe normalized landmarks use IMAGE coordinates.
// x,y are in [0,1] relative to frame width/height, and y INCREASES DOWNWARD. So moving
// "up" in the real world means y gets SMALLER. Keep this straight in phase detection —
// upward velocity is negative dy. World landmarks (meters) are a separate 3D space,
// hip-relative, and are used for joint angles, not for absolute height.

/** A single landmark from MediaPipe. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** 0..1 confidence that the landmark is present/visible. */
  visibility?: number;
}

/** Pose result for one video frame, tagged with its true presentation time. */
export interface FramePose {
  frameIndex: number;
  /** mediaTime from requestVideoFrameCallback (seconds). Source of truth for timing. */
  mediaTime: number;
  /** 33 normalized image-space landmarks (y increases downward). For overlay + trajectories. */
  landmarks: Landmark[];
  /** 33 world landmarks in meters, hip-relative. For joint angles (Milestone 5). */
  worldLandmarks: Landmark[];
}

export type PoseSequence = FramePose[];

/** Output of Milestone 3. Frames are indices into the PoseSequence. */
export interface PhaseSegmentation {
  loadStartFrame: number;
  bottomFrame: number; // deepest point of the countermovement
  takeoffFrame: number;
  landingFrame: number;
  /** How the two detection methods agreed, for debugging/trust (Milestone 3). */
  takeoffAgreementFrames?: number;
  landingAgreementFrames?: number;
}

/** Output of Milestone 4 + 5. */
export interface JumpMetrics {
  flightTimeS: number;
  heightCm: number;
  heightIn: number;
  /** Minimum knee angle at the bottom of the load (degrees). */
  countermovementKneeAngleDeg: number;
}

export interface Cue {
  id: string;
  severity: 'info' | 'suggest' | 'warn';
  text: string;
}

/** A parsed entry from fixtures/clips.json. */
export interface ClipFixture {
  id: string;
  file: string;
  trueHeightCm: number;
  athlete?: string;
  capturedFps?: number;
  referenceMethod?: string;
  notes?: string;
}
