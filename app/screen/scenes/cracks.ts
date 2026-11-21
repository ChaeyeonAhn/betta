// Crack lines on a visitor's front glass, growing with their taps. Seeded by
// the visitor's id so the same cracks appear on the projection (seen from the
// front) and on their phone (seen from inside the cell), and never jump.

import { TAPS_PER_PLAYER } from "@/lib/protocol";

const MAX_CRACKS = 6;

/** Polylines in the unit square: x right, y down, as the projection sees the cell. */
export function crackLines(id: string, effort: number): [number, number][][] {
  const count = Math.min(MAX_CRACKS, Math.floor(effort / (TAPS_PER_PLAYER / MAX_CRACKS)));
  const rand = seeded(id);
  const lines: [number, number][][] = [];
  for (let k = 0; k < count; k++) {
    // Start on a random edge, zig-zag inwards.
    const edge = Math.floor(rand() * 4);
    let x = edge === 0 ? 0 : edge === 1 ? 1 : rand();
    let y = edge === 2 ? 0 : edge === 3 ? 1 : rand();
    const line: [number, number][] = [[x, y]];
    for (let s = 0; s < 4; s++) {
      x += (0.5 - x) * 0.3 + (rand() - 0.5) * 0.18;
      y += (0.5 - y) * 0.3 + (rand() - 0.5) * 0.18;
      line.push([x, y]);
    }
    lines.push(line);
  }
  return lines;
}

function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
