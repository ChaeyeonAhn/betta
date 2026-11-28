"use client";

// Open stage: the walls are down and every betta shares one tank.
// The screen owns this simulation (the server only relays steering):
//   steer        the visitor's joystick, the strongest force while held
//   wander       a slow drift so idle fish keep moving
//   boundary     personal space radius; others inside it get pushed away
//   sociability  pull towards (and matching speed with) fish with a similar genome
//   walls        soft push back from the stage edges
// No fighting: relations show only as drifting together or keeping distance.
// Meetings (encounters.ts): any two that meet (drift close or collide) leave
// a vivid patch of colour on each other at once; the longer two swim
// together, the more and larger the patches.
// Two that collide are also knocked apart.
// Positions live in refs shared by the WebGL tank and the screen-space tags.

import { Hint } from "@/app/_components/Hint";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { type Group, MathUtils } from "three";
import { BettaShape } from "@/app/_components/BettaShape";
import type { BettaSocket } from "@/hooks/useBetta";
import { genomeDistance } from "@/lib/genome";
import type { Genome, PlayerView, Steer } from "@/lib/protocol";
import { BettaCanvas, BettaVisual, stagePoint } from "./BettaCanvas";
import { BettaModel, type BettaMark } from "./BettaModel";
import { MAX_MARKS } from "./bettaMaterial";
import { createEncounters } from "./encounters";
import {
  createGridLayout, GRID_CAMERA_DISTANCE, GRID_FISH, projectedFishCenter, STAGE_H, STAGE_W, type GridHandoff,
} from "./gridLayout";
import styles from "./Open.module.css";
import { swimmingPitch } from "./swimmingPitch";
import { advanceWater, advanceWakes, createWaterCurrent, projectTankPoint, TANK_CAMERA_DISTANCE, TANK_DEPTH, waterAt, type WaterCurrent } from "./waterCurrent";
import { CurrentTraces } from "./CurrentTraces";
import { WaterTank } from "./WaterTank";

const FISH = 150; // BettaShape width in the tank
const FISH_H = FISH * 0.7;
/** The 3D betta's length at depth 0. */
const MODEL = FISH * 0.58;
/** Without WebGL nothing reports ready; start the swimming anyway. */
const READY_FALLBACK_MS = 2500;
const MAX_SPEED = 280;
const EDGE = 80;
const SIMILAR = 0.7; // genomeDistance below this = "like me"
/** A collision throws both fish apart this fast (px/s); it dies away at KNOCK_DECAY per second. */
const KNOCK = 420;
const KNOCK_DECAY = 3.2;
/** Swimming together: another patch of the partner's colour every this many seconds, */
const SPREAD_S = 3.5;
/** while each of that partner's patches grows this much per second, up to MARK_MAX_SIZE (1 = a fleck). */
const MARK_GROW = 0.09;
const MARK_MAX_SIZE = 2.3;
/** The patch any meeting leaves, at once. */
const MEET_SIZE = 1.45;
const STEER_STALE_MS = 800;

type Fish = {
  x: number; y: number; depth: number; preferredDepth: number;
  vx: number; vy: number; screenVx: number; screenVy: number;
  wander: number; dir: 1 | -1; genome: Genome;
  /** Knock-back from a collision, on top of swimming: shoves the body without turning it. */
  kx: number; ky: number;
  /** Colour patches from the bettas it swam with. */
  marks: (BettaMark & { from: string })[];
  /** Seconds spent swimming with each other betta, by id. */
  bonds: Map<string, number>;
};

/**
 * `handoff`: where the grid last showed each betta; they start there and hold
 * still until this tank has drawn its first frame (`onReady`), so the grid can
 * fade over them without a jump.
 */
export function Open({ players, gridSize, socket, handoff, onReady }: {
  players: PlayerView[];
  gridSize: number;
  socket: RefObject<BettaSocket | null>;
  handoff?: GridHandoff;
  onReady?: () => void;
}) {
  const bettas = players.filter((p) => p.genome);
  const steering = useSteering(bettas);
  const [opening] = useState(() => createGridLayout(gridSize));
  const fish = useRef(new Map<string, Fish>());
  const els = useRef(new Map<string, HTMLDivElement>());
  const flips = useRef(new Map<string, HTMLDivElement>());
  const steers = useRef(new Map<string, Steer & { at: number }>());
  const current = useRef<WaterCurrent>(createWaterCurrent());
  const ready = useRef(false);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  const markReady = useRef(() => {
    if (ready.current) return;
    ready.current = true;
    readyCallback.current?.();
  }).current;
  useEffect(() => {
    const timer = setTimeout(markReady, READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [markReady]);

  // Keep the sim in step with who has a betta. The ones from the grid start
  // exactly where the grid last showed them (in their cell, or at the glass
  // they were helping), at the depth that keeps their size, and swim on from
  // there as the grid fades (Screen.tsx); late fish enter from an edge.
  const firstFrame = fish.current.size === 0;
  bettas.forEach((p) => {
    if (fish.current.has(p.id)) return;
    const { slots, side } = opening;
    const start = p.slot === null ? undefined : slots[p.slot];
    // Out of its cell on the grid: wherever it had swum to. Otherwise the grid still showed it in its cell.
    const inCell = side * GRID_FISH * GRID_CAMERA_DISTANCE / (GRID_CAMERA_DISTANCE + side / 2);
    const seen = !firstFrame ? undefined
      : handoff?.get(p.id) ?? (start ? { ...projectedFishCenter(start, side), size: inCell } : undefined);
    const preferredDepth = 130 + Math.random() * 520;
    let c = { x: Math.random() < 0.5 ? -FISH : STAGE_W + FISH, y: STAGE_H * (0.2 + Math.random() * 0.6) };
    let depth = preferredDepth;
    if (seen) {
      depth = MathUtils.clamp(TANK_CAMERA_DISTANCE * (MODEL / seen.size - 1), 0, TANK_DEPTH - 60);
      const scale = TANK_CAMERA_DISTANCE / (TANK_CAMERA_DISTANCE + depth);
      c = { x: STAGE_W / 2 + (seen.x - STAGE_W / 2) / scale, y: STAGE_H / 2 + (seen.y - STAGE_H / 2) / scale };
    }
    const away = Math.atan2(c.y - STAGE_H / 2, c.x - STAGE_W / 2) + (Math.random() - 0.5) * 0.8;
    const speed = seen ? 40 + Math.random() * 50 : 160;
    const vx = seen ? Math.cos(away) * speed : (c.x < 0 ? 1 : -1) * speed;
    const vy = seen ? Math.sin(away) * speed : 0;
    fish.current.set(p.id, {
      x: c.x, y: c.y, depth, preferredDepth,
      vx, vy, screenVx: vx, screenVy: vy, wander: Math.random() * Math.PI * 2,
      dir: vx < 0 ? -1 : 1, genome: p.genome!, kx: 0, ky: 0, marks: [], bonds: new Map(),
    });
  });
  for (const id of fish.current.keys()) if (!bettas.some((p) => p.id === id)) fish.current.delete(id);

  // Tilt steering relayed by the server.
  useEffect(() => {
    const s = socket.current;
    if (!s) return;
    const onSteer = ({ playerId, x, y }: Steer & { playerId: string }) => steers.current.set(playerId, { x, y, at: performance.now() });
    s.on("steer", onSteer);
    return () => {
      s.off("steer", onSteer);
    };
  }, [socket]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const encounters = createEncounters(last);
    let fishCount = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      // Hold everyone where the grid left them until this tank is on screen.
      if (!ready.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const all = [...fish.current.entries()];
      if (all.length < fishCount) encounters.prune(fish.current);
      fishCount = all.length;
      advanceWater(current.current, fish.current.values(), dt);
      advanceWakes(current.current, all, dt);
      for (const [id, f] of all) {
        let ax = 0;
        let ay = 0;
        const g = f.genome;

        const s = steers.current.get(id);
        const steering = s && now - s.at < STEER_STALE_MS && Math.hypot(s.x, s.y) > 0.08;
        if (steering) {
          ax += (s.x * MAX_SPEED - f.vx) * 3;
          ay += (s.y * MAX_SPEED - f.vy) * 3;
        } else {
          f.wander += (Math.random() - 0.5) * dt * 3.0;
          ax += Math.cos(f.wander) * 40;
          ay += Math.sin(f.wander) * 18;
        }

        const personal = 70 + g.boundary * 160;
        for (const [otherId, o] of all) {
          if (otherId === id) continue;
          const dx = o.x - f.x;
          const dy = o.y - f.y;
          const d = Math.hypot(dx, dy, (o.depth - f.depth) * 0.65) || 1;
          const met = id < otherId ? encounters.pair(now, dt, id, f, otherId, o, d) : null;
          if (met === "bump" || met === "near") {
            meet(f, otherId, o.genome, now);
            meet(o, id, g, now);
          }
          if (met === "bump") {
            const flat = Math.hypot(dx, dy) || 1;
            f.kx -= (dx / flat) * KNOCK;
            f.ky -= (dy / flat) * KNOCK;
            o.kx += (dx / flat) * KNOCK;
            o.ky += (dy / flat) * KNOCK;
          } else if (met === "together") {
            takeOn(f, otherId, o.genome, dt, now);
            takeOn(o, id, g, dt, now);
          }
          if (d < personal) {
            const push = (1 - d / personal) * 420 * (0.5 + g.boundary);
            ax -= (dx / d) * push;
            ay -= (dy / d) * push;
          }
          const dist = genomeDistance(g, o.genome);
          if (dist < SIMILAR && d < 480) {
            const like = (1 - dist / SIMILAR) * g.sociability;
            ax += (dx / d) * like * 90 + (o.vx - f.vx) * like * 0.6;
            ay += (dy / d) * like * 90 + (o.vy - f.vy) * like * 0.6;
          }
        }

        if (f.x < EDGE) ax += (EDGE - f.x) * 6;
        if (f.x > STAGE_W - EDGE) ax -= (f.x - (STAGE_W - EDGE)) * 6;
        if (f.y < EDGE * 0.7) ay += (EDGE * 0.7 - f.y) * 6;
        if (f.y > STAGE_H - EDGE * 0.7) ay -= (f.y - (STAGE_H - EDGE * 0.7)) * 6;

        f.vx = (f.vx + ax * dt) * (1 - 0.8 * dt);
        f.vy = (f.vy + ay * dt) * (1 - 0.8 * dt);
        const speed = Math.hypot(f.vx, f.vy);
        if (speed > MAX_SPEED) {
          f.vx *= MAX_SPEED / speed;
          f.vy *= MAX_SPEED / speed;
        }
        const before = projectTankPoint(f.x, f.y, f.depth);
        const water = waterAt(current.current, f.x, f.y, f.depth, id);
        f.x = MathUtils.clamp(f.x + (f.vx + water.x) * dt, 30, STAGE_W - 30);
        f.y = MathUtils.clamp(f.y + (f.vy + water.y) * dt, 26, STAGE_H - 26);
        f.depth = MathUtils.clamp(f.depth + ((f.preferredDepth - f.depth) * 0.28 + water.depth) * dt, 0, TANK_DEPTH - 60);
        // Heading and pitch follow the swimming only; a knock-back then moves the body.
        const swum = projectTankPoint(f.x, f.y, f.depth);
        f.screenVx = (swum.x - before.x) / dt;
        f.screenVy = (swum.y - before.y) / dt;
        if (f.kx !== 0 || f.ky !== 0) {
          f.x = MathUtils.clamp(f.x + f.kx * dt, 30, STAGE_W - 30);
          f.y = MathUtils.clamp(f.y + f.ky * dt, 26, STAGE_H - 26);
          const fade = Math.exp(-KNOCK_DECAY * dt);
          f.kx = Math.abs(f.kx) < 1 ? 0 : f.kx * fade;
          f.ky = Math.abs(f.ky) < 1 ? 0 : f.ky * fade;
        }
        const projected = f.kx === 0 && f.ky === 0 ? swum : projectTankPoint(f.x, f.y, f.depth);
        if (f.screenVx < -8) f.dir = -1;
        else if (f.screenVx > 8) f.dir = 1;

        const el = els.current.get(id);
        if (el) el.style.transform = `translate(${projected.x - FISH / 2}px, ${projected.y - FISH_H / 2}px) scale(${projected.scale})`;
        const flip = flips.current.get(id);
        if (flip) flip.style.transform = `scaleX(${f.dir}) rotate(${-f.dir * swimmingPitch(f.screenVx, f.screenVy)}rad)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className={styles.root}>
      <BettaVisual fallback={null}>
        <BettaCanvas distance={TANK_CAMERA_DISTANCE} scenery={<WaterTank current={current} />}>
          <CurrentTraces current={current} sources={fish} />
          <FirstFrames onDrawn={markReady} />
          {bettas.map((p) => <OpenBetta key={p.id} id={p.id} genome={p.genome!} fish={fish} />)}
        </BettaCanvas>
      </BettaVisual>
      {bettas.map((p) => (
        <div
          key={p.id}
          className={styles.fish}
          style={{ width: FISH }}
          ref={(el) => {
            if (el) els.current.set(p.id, el);
            else els.current.delete(p.id);
          }}
        >
          <div
            className={styles.flip}
            ref={(el) => {
              if (el) flips.current.set(p.id, el);
              else flips.current.delete(p.id);
            }}
          >
            <BettaShape genome={p.genome!} size={FISH} />
          </div>
        </div>
      ))}

      {steering && <Hint kind="steer" size={64} className={styles.hint} />}
    </section>
  );
}

/** Leave a patch of `genome`'s colour on `fish`, vivid whatever the partner's own saturation; a full fish loses its oldest. */
function addMark(fish: Fish, partner: string, genome: Genome, size: number, now: number) {
  if (fish.marks.length >= MAX_MARKS) fish.marks.shift();
  fish.marks.push({
    from: partner, hue: genome.hue, saturation: Math.max(0.9, genome.saturation),
    u: 0.26 + Math.random() * 0.46, v: (Math.random() - 0.5) * 0.18, size, at: now,
  });
}

/** Any meeting, however brief: each takes a patch of the other's colour at once. */
function meet(fish: Fish, partner: string, genome: Genome, now: number) {
  addMark(fish, partner, genome, MEET_SIZE, now);
}

/**
 * One frame of swimming with `partner`: every SPREAD_S together adds another
 * patch of its colour, and all of its patches keep growing. Patches stay when
 * they part; meeting again picks up where they left off.
 */
function takeOn(fish: Fish, partner: string, genome: Genome, dt: number, now: number) {
  const before = fish.bonds.get(partner) ?? 0;
  const after = before + dt;
  fish.bonds.set(partner, after);
  if (Math.floor(after / SPREAD_S) > Math.floor(before / SPREAD_S)) addMark(fish, partner, genome, 1, now);
  for (const mark of fish.marks) {
    if (mark.from === partner) mark.size = Math.min(MARK_MAX_SIZE, mark.size + MARK_GROW * dt);
  }
}

function OpenBetta({ id, genome, fish }: { id: string; genome: Genome; fish: RefObject<Map<string, Fish>> }) {
  const model = useRef<Group>(null);
  const initialYaw = useRef(fish.current.get(id)?.dir === -1 ? Math.PI : 0);
  useFrame((_, delta) => {
    const state = fish.current.get(id);
    const group = model.current;
    if (!state || !group) return;
    group.position.set(...stagePoint(state.x, state.y));
    group.position.z = -state.depth;
    const facing = state.dir === 1 ? 0 : Math.PI;
    group.rotation.y = MathUtils.damp(group.rotation.y, facing, 8, delta);
    // In XYZ Euler order, the Y turn does not reverse the pitch's Y component.
    group.rotation.z = swimmingPitch(state.screenVx, state.screenVy);
  });

  return (
    <group ref={model} rotation-y={initialYaw.current}>
      <BettaModel genome={genome} seed={id} size={MODEL} followHeading marks={() => fish.current.get(id)?.marks} />
    </group>
  );
}

/** Calls `onDrawn` once the tank has drawn a couple of frames with its bettas loaded (it sits in their Suspense). */
function FirstFrames({ onDrawn }: { onDrawn: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    if (++frames.current === 3) onDrawn();
  });
  return null;
}

/**
 * True while any visitor still has the console: their phone turns into the
 * betta card at `openUntil`. A phone that drops off for a moment (screen lock,
 * Safari in the background) still counts until its time is up, so the hint
 * doesn't vanish while people are steering. Re-renders when the next one is due.
 */
function useSteering(bettas: PlayerView[]) {
  const [now, setNow] = useState(() => Date.now());
  const due = bettas.map((p) => p.openUntil);
  const steering = due.some((at) => at === null || at > now);
  const next = Math.min(...due.filter((at): at is number => at !== null && at > now));
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(Date.now()), next - Date.now() + 50);
    return () => clearTimeout(timer);
  }, [next]);
  return steering;
}
