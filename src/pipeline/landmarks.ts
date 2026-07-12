// MediaPipe Pose Landmarker returns 33 landmarks per frame, in a fixed index order.
// These are the indices the jump pipeline actually uses. Full list:
// https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

export const LM = {
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, // toe
  RIGHT_FOOT_INDEX: 32, // toe
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
} as const;

// Landmarks whose presence we require to trust a clip (Milestone 6 input validation).
// If these aren't confidently visible for most frames, the body isn't fully in frame.
export const REQUIRED_LANDMARKS: number[] = [
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
  LM.LEFT_KNEE,
  LM.RIGHT_KNEE,
  LM.LEFT_ANKLE,
  LM.RIGHT_ANKLE,
  LM.LEFT_FOOT_INDEX,
  LM.RIGHT_FOOT_INDEX,
];
