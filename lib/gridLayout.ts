// The projection's fixed stage and its grid of cells. Shared by the screen
// (scenes) and the server, which hands each released betta a cell.

export const STAGE_W = 1920;
export const STAGE_H = 602;

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
