import { STAGE_H, STAGE_W } from "./gridLayout.ts";

export const TANK_CAMERA_DISTANCE = 920;
export const TANK_DEPTH = 1080;
export const MAX_WAKES = 128;
export const WAKE_LIFETIME = 3.6;
const WAKE_INTERVAL = 0.24;
const MAX_WAKE_SPEED = 68;
const MAX_WATER_SPEED = 125;
export type Swimmer = { vx: number; vy: number };
type WakeSwimmer = Swimmer & { x: number; y: number; depth: number };
export type WaterWake = {
  id: number;
  owner: string;
  x: number; y: number; depth: number;
  dx: number; dy: number;
  strength: number;
  age: number;
  radius: number;
  length: number;
};
export type WaterCurrent = {
  x: number; y: number; offsetX: number; offsetY: number; time: number;
  wakes: WaterWake[];
  wakeSerial: number;
  wakeEmitters: Map<string, number>;
};

export function createWaterCurrent(): WaterCurrent {
  return { x: 0, y: 0, offsetX: 0, offsetY: 0, time: 0, wakes: [], wakeSerial: 0, wakeEmitters: new Map() };
}

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

/** The ambient circulation and cooperative global current, before local wakes. */
export function ambientAt(current: WaterCurrent, x: number, y: number, depth: number) {
  const t = current.time;
  return {
    x: current.x + 15 + 14 * Math.sin(y * 0.007 + depth * 0.004 + t * 0.34),
    y: current.y + 9 * Math.cos(x * 0.003 - depth * 0.004 - t * 0.31),
    depth: 26 * Math.sin(x * 0.002 + y * 0.005 + t * 0.45) + current.x * 0.13,
  };
}

/** Deposit a short-lived parcel behind each swimmer, using swimming relative to the water. */
export function advanceWakes(current: WaterCurrent, swimmers: Iterable<readonly [string, WakeSwimmer]>, dt: number) {
  let alive = 0;
  for (const wake of current.wakes) {
    wake.age += dt;
    if (wake.age >= WAKE_LIFETIME) continue;
    const drift = ambientAt(current, wake.x, wake.y, wake.depth);
    wake.x += drift.x * dt * 0.65;
    wake.y += drift.y * dt * 0.65;
    wake.depth = Math.max(0, Math.min(TANK_DEPTH, wake.depth + drift.depth * dt * 0.35));
    wake.strength *= Math.exp(-dt * 0.55);
    wake.radius = 44 + wake.age * 18;
    wake.length = 95 + wake.age * 28;
    current.wakes[alive++] = wake;
  }
  current.wakes.length = alive;

  const owners = new Set<string>();
  for (const [owner, swimmer] of swimmers) {
    owners.add(owner);
    const speed = Math.hypot(swimmer.vx, swimmer.vy);
    if (speed < 44) continue;
    const last = current.wakeEmitters.get(owner) ?? -Infinity;
    if (current.time - last < WAKE_INTERVAL) continue;
    current.wakeEmitters.set(owner, current.time);
    const dx = swimmer.vx / speed;
    const dy = swimmer.vy / speed;
    current.wakes.push({
      id: ++current.wakeSerial, owner,
      x: swimmer.x - dx * 68, y: swimmer.y - dy * 68, depth: swimmer.depth,
      dx, dy, strength: Math.min(76, Math.max(8, (speed - 24) * 0.29)),
      age: 0, radius: 44, length: 95,
    });
  }
  for (const owner of current.wakeEmitters.keys()) {
    if (!owners.has(owner)) current.wakeEmitters.delete(owner);
  }
  if (current.wakes.length > MAX_WAKES) current.wakes.splice(0, current.wakes.length - MAX_WAKES);
}

/** Compact three-dimensional wake field. An owner never feels its own deposited wake. */
export function wakeAt(current: WaterCurrent, x: number, y: number, depth: number, excludeOwner?: string) {
  let vx = 0;
  let vy = 0;
  let vz = 0;
  for (const wake of current.wakes) {
    if (wake.owner === excludeOwner) continue;
    const dx = x - wake.x;
    const dy = y - wake.y;
    const along = (dx * wake.dx + dy * wake.dy) / wake.length;
    const across = (-dx * wake.dy + dy * wake.dx) / wake.radius;
    const vertical = (depth - wake.depth) / (115 + wake.age * 18);
    const distance = along * along + across * across + vertical * vertical;
    if (distance >= 1) continue;
    const weight = (1 - distance) ** 2 * (1 - wake.age / WAKE_LIFETIME);
    const push = wake.strength * weight;
    // The two sides curl in opposite directions as the trailing jet widens.
    const curl = along * across * 0.9;
    vx += (wake.dx - wake.dy * curl) * push;
    vy += (wake.dy + wake.dx * curl) * push;
    vz += Math.sin(wake.age * 2.4 + across * 2) * push * 0.08;
  }
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_WAKE_SPEED) {
    vx *= MAX_WAKE_SPEED / speed;
    vy *= MAX_WAKE_SPEED / speed;
  }
  return { x: vx, y: vy, depth: Math.max(-8, Math.min(8, vz)) };
}

/** This exact field carries fish, suspended matter and the visible current traces. */
export function waterAt(current: WaterCurrent, x: number, y: number, depth: number, excludeOwner?: string) {
  const water = ambientAt(current, x, y, depth);
  const wake = wakeAt(current, x, y, depth, excludeOwner);
  water.x += wake.x;
  water.y += wake.y;
  water.depth = Math.max(-40, Math.min(40, water.depth + wake.depth));
  const speed = Math.hypot(water.x, water.y);
  if (speed > MAX_WATER_SPEED) {
    water.x *= MAX_WATER_SPEED / speed;
    water.y *= MAX_WATER_SPEED / speed;
  }
  return water;
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
