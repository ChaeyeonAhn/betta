"use client";

// The projection is authored at a fixed 1920 × 602 stage (app/screen/Screen.tsx
// scales it to the window with letterboxing). All scene coordinates are stage px.

export const STAGE_W = 1920;
export const STAGE_H = 602;
export const GAP_X = 40;
export const GAP_Y = 20;

/**
 * Grid layout shared by born, grid and the start of open, so a betta keeps its
 * place between stages. `size` is the BettaShape width; a cell is size × cellH.
 */
export function useFit(count: number) {
  const view = { w: STAGE_W, h: STAGE_H };
  // Pick the column count that gives the biggest fish on the very wide stage (≈ 3.2 : 1).
  const sizeFor = (cols: number) => {
    const rowsFor = Math.ceil(Math.max(1, count) / cols);
    return Math.floor(Math.min(220, (view.w * 0.92) / cols - GAP_X, ((view.h * 0.72) / rowsFor - GAP_Y - 16) / 0.7));
  };
  let columns = 1;
  for (let c = 2; c <= Math.max(1, count); c++) if (sizeFor(c) > sizeFor(columns)) columns = c;
  const rows = Math.max(1, Math.ceil(count / columns));
  const size = Math.max(60, sizeFor(columns));
  const cellH = Math.round(size * 0.7 + 16);
  return { view, columns, rows, size, cellH };
}

/** Centre of cell i in stage coordinates (matches the CSS grid used by Born). */
export function cellCenter(i: number, fit: ReturnType<typeof useFit>) {
  const { view, columns, rows, size, cellH } = fit;
  const gridW = columns * size + (columns - 1) * GAP_X;
  const gridH = rows * cellH + (rows - 1) * GAP_Y;
  const col = i % columns;
  const row = Math.floor(i / columns);
  return {
    x: (view.w - gridW) / 2 + col * (size + GAP_X) + size / 2,
    y: (view.h - gridH) / 2 + row * (cellH + GAP_Y) + cellH / 2,
  };
}
