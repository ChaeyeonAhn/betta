// Projection scenes share a fixed stage, letterboxed by Screen.tsx.
// The stage size and cell layout live in lib/ so the server can use them too.
import { STAGE_H, STAGE_W } from "../../../lib/gridLayout.ts";

export { createGridLayout, STAGE_H, STAGE_W } from "../../../lib/gridLayout.ts";

// 48° vertical, about 110° horizontal at the stage's wide aspect ratio.
export const GRID_CAMERA_DISTANCE = (STAGE_H / 2) / Math.tan(24 * Math.PI / 180);

/** A betta in the grid is this share of its cell long. */
export const GRID_FISH = 0.43;
/** Where each betta last showed on the projection (stage px) and how long it looked, so the open tank picks it up there. */
export type GridHandoff = Map<string, { x: number; y: number; size: number }>;

/** A fish starts halfway through the cube, behind its tagged front face. */
export function projectedFishCenter(slot: { x: number; y: number }, side: number) {
  const scale = GRID_CAMERA_DISTANCE / (GRID_CAMERA_DISTANCE + side / 2);
  return {
    x: STAGE_W / 2 + (slot.x - STAGE_W / 2) * scale,
    y: STAGE_H / 2 + (slot.y - STAGE_H / 2) * scale,
  };
}

function hashId(id: string) {
  let hash = 2166136261;
  for (const letter of id) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

/**
 * Grid stage: where a betta that broke out waits while it helps another cell,
 * in front of that cell's glass and spread around it by id. Stage pixels for
 * x and y; `z` is toward the camera from the front faces.
 */
export function helperSpot(id: string, slot: { x: number; y: number }, side: number) {
  const angle = hashId(id) * Math.PI * 2;
  return { x: slot.x + Math.cos(angle) * side * 0.38, y: slot.y + Math.sin(angle) * side * 0.3, z: side * 0.32 };
}
