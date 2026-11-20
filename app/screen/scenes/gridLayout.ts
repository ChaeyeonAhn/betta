// Projection scenes share a fixed stage, letterboxed by Screen.tsx.
export const STAGE_W = 1920;
export const STAGE_H = 602;
// 48° vertical, about 110° horizontal at the stage's wide aspect ratio.
export const GRID_CAMERA_DISTANCE = (STAGE_H / 2) / Math.tan(24 * Math.PI / 180);

const GRID_H = STAGE_H - 54; // Leave room for the shared effort gauge.

/** Screen positions of the front faces, ordered from the middle out. */
export function createGridLayout(playerCount: number) {
  let rows = 3;
  let columns = Math.round(STAGE_W / (GRID_H / rows));
  while (columns * rows < playerCount) {
    rows++;
    columns = Math.round(STAGE_W / (GRID_H / rows));
  }

  const pitchX = STAGE_W / columns;
  const pitchY = GRID_H / rows;
  const side = Math.floor(Math.min(pitchX - 24, pitchY - 21));
  const slots = Array.from({ length: columns * rows }, (_, i) => {
    const x = (i % columns + 0.5) * pitchX;
    const y = (Math.floor(i / columns) + 0.5) * pitchY;
    const distance = Math.hypot(x - STAGE_W / 2, y - GRID_H / 2);
    return { x, y, distance };
  });
  slots.sort((a, b) => a.distance - b.distance);
  return { slots, side, rows, columns, pitchX, pitchY };
}

/** A fish starts halfway through the cube, behind its tagged front face. */
export function projectedFishCenter(slot: { x: number; y: number }, side: number) {
  const scale = GRID_CAMERA_DISTANCE / (GRID_CAMERA_DISTANCE + side / 2);
  return {
    x: STAGE_W / 2 + (slot.x - STAGE_W / 2) * scale,
    y: STAGE_H / 2 + (slot.y - STAGE_H / 2) * scale,
  };
}
