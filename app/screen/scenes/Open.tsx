"use client";

// Open stage: the walls are down and every betta shares one tank.
// The screen owns this simulation (the server only relays steering):
//   steer        the visitor's joystick, the strongest force while held
//   wander       a slow drift so idle fish keep moving
//   boundary     personal space radius; others inside it get pushed away
//   sociability  pull towards (and matching speed with) fish with a similar genome
//   walls        soft push back from the stage edges
// No fighting: relations show only as drifting together or keeping distance.
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
import { BettaModel } from "./BettaModel";
import { createBubbleEvents } from "./bubbleEvents";
import { createGridLayout, projectedFishCenter, STAGE_H, STAGE_W } from "./gridLayout";
import styles from "./Open.module.css";
import { swimmingPitch } from "./swimmingPitch";
import { advanceWater, projectTankPoint, TANK_CAMERA_DISTANCE, TANK_DEPTH, waterAt, type WaterCurrent } from "./waterCurrent";
import { WaterTank } from "./WaterTank";

const FISH = 150; // BettaShape width in the tank
const FISH_H = FISH * 0.7;
const MAX_SPEED = 280;
const EDGE = 80;
const SIMILAR = 0.7; // genomeDistance below this = "like me"
const STEER_STALE_MS = 800;

type Fish = {
  x: number; y: number; depth: number; preferredDepth: number;
  vx: number; vy: number; screenVx: number; screenVy: number;
  wander: number; dir: 1 | -1; genome: Genome;
};

export function Open({ players, gridSize, socket }: {
  players: PlayerView[];
  gridSize: number;
  socket: RefObject<BettaSocket | null>;
}) {
  const bettas = players.filter((p) => p.genome);
  const steering = useSteering(bettas);
  const [opening] = useState(() => createGridLayout(gridSize));
  const fish = useRef(new Map<string, Fish>());
  const els = useRef(new Map<string, HTMLDivElement>());
  const flips = useRef(new Map<string, HTMLDivElement>());
  const steers = useRef(new Map<string, Steer & { at: number }>());
  const current = useRef<WaterCurrent>({ x: 0, y: 0, offsetX: 0, offsetY: 0, time: 0 });

  // Keep the sim in step with who has a betta. New fish start in their grid
  // cell and drift out of it as the grid fades (Screen.tsx); late fish enter from an edge.
  const firstFrame = fish.current.size === 0;
  bettas.forEach((p) => {
    if (fish.current.has(p.id)) return;
    const start = p.slot === null ? undefined : opening.slots[p.slot];
    const c = firstFrame && start
      ? projectedFishCenter(start, opening.side)
      : { x: Math.random() < 0.5 ? -FISH : STAGE_W + FISH, y: STAGE_H * (0.2 + Math.random() * 0.6) };
    const away = Math.atan2(c.y - STAGE_H / 2, c.x - STAGE_W / 2) + (Math.random() - 0.5) * 0.8;
    const speed = firstFrame ? 40 + Math.random() * 50 : 160;
    const vx = firstFrame ? Math.cos(away) * speed : (c.x < 0 ? 1 : -1) * speed;
    const vy = firstFrame ? Math.sin(away) * speed : 0;
    const preferredDepth = 130 + Math.random() * 520;
    fish.current.set(p.id, {
      x: c.x, y: c.y, depth: firstFrame ? 0 : preferredDepth, preferredDepth,
      vx, vy, screenVx: vx, screenVy: vy, wander: Math.random() * Math.PI * 2,
      dir: vx < 0 ? -1 : 1, genome: p.genome!,
    });
  });
  for (const id of fish.current.keys()) if (!bettas.some((p) => p.id === id)) fish.current.delete(id);

  // Joystick input relayed by the server.
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
    const bubbles = createBubbleEvents(last);
    let fishCount = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const all = [...fish.current.entries()];
      if (all.length < fishCount) bubbles.prune(fish.current);
      fishCount = all.length;
      advanceWater(current.current, fish.current.values(), dt);
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
          if (id < otherId) bubbles.pair(now, id, f, otherId, o, d);
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
        const water = waterAt(current.current, f.x, f.y, f.depth);
        f.x = MathUtils.clamp(f.x + (f.vx + water.x) * dt, 30, STAGE_W - 30);
        f.y = MathUtils.clamp(f.y + (f.vy + water.y) * dt, 26, STAGE_H - 26);
        f.depth = MathUtils.clamp(f.depth + ((f.preferredDepth - f.depth) * 0.28 + water.depth) * dt, 0, TANK_DEPTH - 60);
        const projected = projectTankPoint(f.x, f.y, f.depth);
        f.screenVx = (projected.x - before.x) / dt;
        f.screenVy = (projected.y - before.y) / dt;
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
      <BettaModel genome={genome} seed={id} size={FISH * 0.58} followHeading />
    </group>
  );
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
