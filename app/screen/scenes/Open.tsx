"use client";

// Open stage: the walls are down and every betta shares one tank.
// The screen owns this simulation (the server only relays steering):
//   steer        the visitor's joystick, the strongest force while held
//   wander       a slow drift so idle fish keep moving
//   boundary     personal space radius; others inside it get pushed away
//   sociability  pull towards (and matching speed with) fish with a similar genome
//   walls        soft push back from the stage edges
// No fighting: relations show only as drifting together or keeping distance.
// Positions live in refs and are written straight to the DOM each frame.

import { useEffect, useRef, type RefObject } from "react";
import { BettaShape } from "@/app/_components/BettaShape";
import type { BettaSocket } from "@/hooks/useBetta";
import { genomeDistance } from "@/lib/genome";
import { shortTag } from "@/lib/playerId";
import type { Genome, PlayerView, Steer } from "@/lib/protocol";
import styles from "./Open.module.css";
import { CELLS, bettaSlots, project } from "./grid3d";
import { STAGE_H, STAGE_W } from "./useFit";

const FISH = 150; // BettaShape width in the tank
const FISH_H = FISH * 0.7;
const MAX_SPEED = 280;
const EDGE = 80;
const SIMILAR = 0.7; // genomeDistance below this = "like me"
const STEER_STALE_MS = 800;

type Fish = { x: number; y: number; vx: number; vy: number; wander: number; dir: 1 | -1; genome: Genome };

export function Open({ players, socket }: { players: PlayerView[]; socket: RefObject<BettaSocket | null> }) {
  const bettas = players.filter((p) => p.genome);
  // Where each betta's cube was in the grid stage (stage px), so they burst out from there.
  const slots = bettaSlots(bettas.length);
  const cubeAt = (i: number) => project({ ...CELLS[slots[i]], z: 0.5 });
  const fish = useRef(new Map<string, Fish>());
  const els = useRef(new Map<string, HTMLDivElement>());
  const flips = useRef(new Map<string, HTMLDivElement>());
  const steers = useRef(new Map<string, Steer & { at: number }>());

  // Keep the sim in step with who has a betta. New fish start in their grid
  // cell and burst outwards (the walls just came down); late fish enter from an edge.
  const firstFrame = fish.current.size === 0;
  bettas.forEach((p, i) => {
    if (fish.current.has(p.id)) return;
    const c = firstFrame ? cubeAt(i) : { x: Math.random() < 0.5 ? -FISH : STAGE_W + FISH, y: STAGE_H * (0.2 + Math.random() * 0.6) };
    const away = Math.atan2(c.y - STAGE_H / 2, c.x - STAGE_W / 2) + (Math.random() - 0.5) * 0.8;
    const speed = firstFrame ? 260 + Math.random() * 160 : 160;
    const vx = firstFrame ? Math.cos(away) * speed : (c.x < 0 ? 1 : -1) * speed;
    const vy = firstFrame ? Math.sin(away) * speed : 0;
    fish.current.set(p.id, { x: c.x, y: c.y, vx, vy, wander: Math.random() * Math.PI * 2, dir: vx < 0 ? -1 : 1, genome: p.genome! });
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
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const all = [...fish.current.entries()];
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
          f.wander += (Math.random() - 0.5) * dt * 3;
          ax += Math.cos(f.wander) * 40;
          ay += Math.sin(f.wander) * 18; // the tank is wide: drift more sideways
        }

        const personal = 70 + g.boundary * 160;
        for (const [otherId, o] of all) {
          if (otherId === id) continue;
          const dx = o.x - f.x;
          const dy = o.y - f.y;
          const d = Math.hypot(dx, dy) || 1;
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
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.vx < -8) f.dir = -1;
        else if (f.vx > 8) f.dir = 1;

        const tilt = Math.max(-0.45, Math.min(0.45, f.vy / (Math.abs(f.vx) + 60))) * f.dir;
        const el = els.current.get(id);
        if (el) el.style.transform = `translate(${f.x - FISH / 2}px, ${f.y - FISH_H / 2}px)`;
        const flip = flips.current.get(id);
        if (flip) flip.style.transform = `scaleX(${f.dir}) rotate(${tilt}rad)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className={styles.root}>
      {/* The partitions fly apart once, as the scene opens. */}
      {bettas.map((p, i) => {
        const c = cubeAt(i);
        const w = c.pxPerUnit;
        const h = c.pxPerUnit;
        const dx = (c.x - STAGE_W / 2) * 0.6;
        const dy = (c.y - STAGE_H / 2) * 0.9 - 40;
        return (
          <div
            key={`wall-${p.id}`}
            className={styles.wall}
            style={{ left: c.x - w / 2, top: c.y - h / 2, width: w, height: h, "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties}
          />
        );
      })}

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
          <span className={styles.tag}>{shortTag(p.id)}</span>
        </div>
      ))}

      <p className={styles.caption}>steer your betta from your phone</p>
    </section>
  );
}
