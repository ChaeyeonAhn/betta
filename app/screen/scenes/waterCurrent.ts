import { STAGE_H, STAGE_W } from "./gridLayout.ts";

export const TANK_CAMERA_DISTANCE = 920;
export const TANK_DEPTH = 1080;
export type Swimmer = { vx: number; vy: number };
export type WaterCurrent = { x: number; y: number; offsetX: number; offsetY: number; time: number };

export function advanceWater(current: WaterCurrent, swimmers: Iterable<Swimmer>, dt: number) {
  let x = 0;
  let y = 0;
  let moving = 0;
  for (const swimmer of swimmers) {
    const speed = Math.hypot(swimmer.vx, swimmer.vy);
    if (speed < 36) continue;
    x += swimmer.vx / speed;
    y += swimmer.vy / speed;
    moving++;
  }
  const order = moving >= 2 ? Math.hypot(x, y) / moving : 0;
  const strength = Math.min(1, Math.max(0, (order - 0.62) / 0.38)) * Math.min(1, (moving + 1) / 5);
  const follow = 1 - Math.exp(-dt * 0.9);
  const divisor = Math.max(1, moving);
  current.x += (strength * 78 * x / divisor - current.x) * follow;
  current.y += (strength * 78 * y / divisor - current.y) * follow;
  current.offsetX += (current.x + 15) * dt;
  current.offsetY += current.y * dt;
  current.time += dt;
}

export function waterAt(current: WaterCurrent, x: number, y: number, depth: number) {
  const t = current.time;
  return {
    x: current.x + 15 + 14 * Math.sin(y * 0.007 + depth * 0.004 + t * 0.34),
    y: current.y + 9 * Math.cos(x * 0.003 - depth * 0.004 - t * 0.31),
    depth: 26 * Math.sin(x * 0.002 + y * 0.005 + t * 0.45) + current.x * 0.13,
  };
}

/** Keep DOM tags aligned to the same perspective as fish behind the glass. */
export function projectTankPoint(x: number, y: number, depth: number) {
  const scale = TANK_CAMERA_DISTANCE / (TANK_CAMERA_DISTANCE + depth);
  return {
    x: STAGE_W / 2 + (x - STAGE_W / 2) * scale,
    y: STAGE_H / 2 + (y - STAGE_H / 2) * scale,
    scale,
  };
}
