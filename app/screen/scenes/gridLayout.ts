// Projection scenes share a fixed stage, letterboxed by Screen.tsx.
// The stage size and cell layout live in lib/ so the server can use them too.
import { STAGE_H, STAGE_W } from "../../../lib/gridLayout.ts";

export { createGridLayout, STAGE_H, STAGE_W } from "../../../lib/gridLayout.ts";

// 48° vertical, about 110° horizontal at the stage's wide aspect ratio.
export const GRID_CAMERA_DISTANCE = (STAGE_H / 2) / Math.tan(24 * Math.PI / 180);

/** A fish starts halfway through the cube, behind its tagged front face. */
export function projectedFishCenter(slot: { x: number; y: number }, side: number) {
  const scale = GRID_CAMERA_DISTANCE / (GRID_CAMERA_DISTANCE + side / 2);
  return {
    x: STAGE_W / 2 + (slot.x - STAGE_W / 2) * scale,
    y: STAGE_H / 2 + (slot.y - STAGE_H / 2) * scale,
  };
}
