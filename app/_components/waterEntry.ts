export type WaterEntry = "lobby" | "diving" | "underwater";

export const WATER_ENTRY_MS = 1850;
export const WATER_ENTRY_REDUCED_MS = 160;

// The entry camera, shared by the pool shader and the icons floating on it.
// The shader traces rays of `normalize(vec3((uv - 0.5) * ENTRY_RAY, -1))`, so
// ENTRY_RAY / 2 is the half-tangent of the view in x and y.
export const ENTRY_EYE = [0, 2.55, 1.75] as const;
export const ENTRY_PITCH = -0.20944;
/** Extra downward nod in the middle of the dive. */
export const ENTRY_DIP = 0.32;
export const ENTRY_RAY = [2.7, 1.24] as const;
/** Resting height of the pool surface (`wsRoof` oscillates around it). */
export const WATER_SURFACE_Y = 1.05;

/** A GLSL float literal: `0` would be an int there. */
export const glslFloat = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** Where the camera is at a point of the dive (0 = in the air, 1 = underwater). */
export function entryCamera(progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  const move = p * p * (3 - 2 * p);
  return {
    eye: [ENTRY_EYE[0] * (1 - move), ENTRY_EYE[1] * (1 - move), ENTRY_EYE[2] * (1 - move)] as const,
    pitch: ENTRY_PITCH * (1 - move) - ENTRY_DIP * Math.sin(Math.PI * move),
  };
}
