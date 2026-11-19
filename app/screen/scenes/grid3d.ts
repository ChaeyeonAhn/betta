// 3D layout of the partitioned tank (grid stage), shared with the open stage
// so bettas burst out from where their cube was.
//
// A front-facing lattice of unit cubes, wider and taller than the camera sees,
// so it reads as cubes laid out across all of the space. Bettas take the cells
// nearest the centre; the rest stay empty.

import { STAGE_H, STAGE_W } from "./useFit";

export const COLS = 23;
export const ROWS = 7;
export const PITCH = 1.18; // cube size is 1; the rest is the gap between partitions
export const FOV = 26; // degrees, vertical
export const CAM_Z = 11;

export type Cell = { x: number; y: number; z: number };

export const CELLS: Cell[] = Array.from({ length: COLS * ROWS }, (_, i) => ({
  x: ((i % COLS) - (COLS - 1) / 2) * PITCH,
  y: ((ROWS - 1) / 2 - Math.floor(i / COLS)) * PITCH,
  z: 0,
}));

/**
 * Cells for n bettas: nearest the centre first. Horizontal distance counts
 * less, so a handful of fish spread along the wide stage rather than stacking.
 */
export function bettaSlots(n: number): number[] {
  return CELLS.map((c, i) => ({ i, d: Math.hypot(c.x * 0.45, c.y) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, Math.min(n, CELLS.length))
    .map((s) => s.i);
}

/** Stage px of a world point, for the resting camera (no drift). */
export function project(p: Cell) {
  const k = STAGE_H / 2 / Math.tan(((FOV / 2) * Math.PI) / 180) / (CAM_Z - p.z);
  return { x: STAGE_W / 2 + p.x * k, y: STAGE_H / 2 - p.y * k, pxPerUnit: k };
}
