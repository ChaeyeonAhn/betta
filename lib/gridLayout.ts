// The projection's fixed stage and its grid of cells. Shared by the screen
// (scenes) and the server, which hands each released betta a cell.

export const STAGE_W = 1920;
export const STAGE_H = 602;

const GRID_H = STAGE_H - 54; // Leave room for the shared effort gauge.

type GridLayout = {
  slots: { x: number; y: number; distance: number }[];
  side: number;
  rows: number;
  columns: number;
  pitchX: number;
  pitchY: number;
};

const layouts = new Map<number, GridLayout>();

/** Existing slot identities stay near their previous cells when the grid grows. */
export function createGridLayout(playerCount: number): GridLayout {
  let rows = 3;
  while (Math.round(STAGE_W / (GRID_H / rows)) * rows < playerCount) rows++;

  // Build every intermediate resolution so a slot's identity does not depend
  // on how many visitors happened to arrive in one server snapshot.
  for (let size = 3; size <= rows; size++) {
    if (layouts.has(size)) continue;
    const columns = Math.round(STAGE_W / (GRID_H / size));
    const pitchX = STAGE_W / columns;
    const pitchY = GRID_H / size;
    const side = Math.floor(Math.min(pitchX - 24, pitchY - 21));
    const cells = Array.from({ length: columns * size }, (_, index) => {
      const x = (index % columns + 0.5) * pitchX;
      const y = (Math.floor(index / columns) + 0.5) * pitchY;
      return { x, y, distance: Math.hypot(x - STAGE_W / 2, y - GRID_H / 2) };
    });
    const previous = layouts.get(size - 1);
    // Both axes strictly grow, so rounding each old centre to its nearest new
    // cell is injective. Keep those cells in the previous slot-index order.
    const reserved = previous?.slots.map(({ x, y }) =>
      Math.floor(y / pitchY) * columns + Math.floor(x / pitchX)) ?? [];
    const occupied = new Set(reserved);
    const remaining = cells.filter((_, index) => !occupied.has(index))
      .sort((a, b) => a.distance - b.distance);
    const slots = reserved.map((index) => cells[index]).concat(remaining);
    layouts.set(size, { slots, side, rows: size, columns, pitchX, pitchY });
  }
  return layouts.get(rows)!;
}
