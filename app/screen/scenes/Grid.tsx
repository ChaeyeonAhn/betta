"use client";

// Grid stage in 3D: a front-facing lattice of wireframe cubes laid out across
// the whole stage, most of them empty, one betta in each occupied cube.
// Tapping on the phone pushes your own wall: your cube shakes and cracks
// spread over its front face. As the room's shared push builds, every cube
// trembles a little. The camera drifts slowly, like being underwater.
// The server decides when the walls break (together, or at the deadline).

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { BettaShape } from "@/app/_components/BettaShape";
import { shortTag } from "@/lib/playerId";
import { TAPS_PER_PLAYER, type PlayerView, type SessionState } from "@/lib/protocol";
import styles from "./Grid.module.css";
import { CAM_Z, CELLS, FOV, bettaSlots, type Cell } from "./grid3d";
import { STAGE_H, STAGE_W } from "./useFit";

const MAX_CRACKS = 6;
const BETTA_PX = 172; // BettaShape width in the overlay, before scaling
const BETTA_UNITS = 0.86; // how wide the fish looks inside its 1-unit cube

/** Bettas are flat DOM sprites over the canvas, moved each frame to their cube's projected position. */
type Sprites = RefObject<Map<string, HTMLDivElement>>;
const BOX_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));

export function Grid({ state }: { state: SessionState }) {
  const bettas = state.players.filter((p) => p.genome);
  const sprites = useRef(new Map<string, HTMLDivElement>());
  const now = useNow();
  const left = state.deadline ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : null;
  const share = state.effort.threshold ? Math.min(1, state.effort.total / state.effort.threshold) : 0;

  return (
    <section className={styles.root}>
      {/* offsetSize: measure the unscaled 1920×602 stage, not the letterboxed size on screen. */}
      <Canvas
        className={styles.canvas}
        resize={{ offsetSize: true }}
        camera={{ fov: FOV, position: [0, 0, CAM_Z], near: 0.1, far: 100 }}
        dpr={[1, 2]}
      >
        <Lattice bettas={bettas} share={share} sprites={sprites} />
      </Canvas>

      {bettas.map((p) => (
        <div
          key={p.id}
          className={styles.sprite}
          style={{ width: BETTA_PX }}
          ref={(el) => {
            if (el) sprites.current.set(p.id, el);
            else sprites.current.delete(p.id);
          }}
        >
          <BettaShape genome={p.genome!} size={BETTA_PX} label={shortTag(p.id)} />
        </div>
      ))}

      <footer className={styles.footer}>
        <p className={styles.caption}>tap your phone to push the walls · together{left !== null ? ` · ${left}s` : ""}</p>
        <div className={styles.bar}>
          <div className={styles.fill} style={{ transform: `scaleX(${share})` }} />
        </div>
      </footer>
    </section>
  );
}

function Lattice({ bettas, share, sprites }: { bettas: PlayerView[]; share: number; sprites: Sprites }) {
  const slots = useMemo(() => bettaSlots(bettas.length), [bettas.length]);

  // All empty cubes as one line geometry.
  const empty = useMemo(() => {
    const taken = new Set(slots);
    const src = BOX_EDGES.attributes.position.array as Float32Array;
    const cells = CELLS.filter((_, i) => !taken.has(i));
    const out = new Float32Array(src.length * cells.length);
    cells.forEach((c, k) => {
      for (let j = 0; j < src.length; j += 3) {
        out[k * src.length + j] = src[j] + c.x;
        out[k * src.length + j + 1] = src[j + 1] + c.y;
        out[k * src.length + j + 2] = src[j + 2] + c.z;
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(out, 3));
    return geometry;
  }, [slots]);

  const lattice = useRef<THREE.Group>(null);
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    camera.position.set(Math.sin(t * 0.07) * 0.55, Math.cos(t * 0.053) * 0.22, CAM_Z + Math.sin(t * 0.031) * 0.3);
    camera.lookAt(Math.sin(t * 0.045) * 0.25, Math.sin(t * 0.06) * 0.08, 0);
    // The whole tank trembles as the shared push builds.
    if (lattice.current) {
      const a = share * share * 0.025;
      lattice.current.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, 0);
    }
  });

  return (
    <group ref={lattice}>
      <lineSegments geometry={empty}>
        <lineBasicMaterial color="#3a3a3a" />
      </lineSegments>
      {bettas.map((p, i) => (
        <BettaCube key={p.id} player={p} cell={CELLS[slots[i]]} sprites={sprites} />
      ))}
    </group>
  );
}

const world = new THREE.Vector3();
const TAN_HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180);

function BettaCube({ player, cell, sprites }: { player: PlayerView; cell: Cell; sprites: Sprites }) {
  const group = useRef<THREE.Group>(null);
  const shake = useRef(0);
  const prevEffort = useRef(player.effort);

  useEffect(() => {
    if (player.effort > prevEffort.current) shake.current = 1;
    prevEffort.current = player.effort;
  }, [player.effort]);

  useFrame(({ camera }, dt) => {
    shake.current = Math.max(0, shake.current - dt * 4);
    const a = shake.current * 0.06;
    const g = group.current;
    if (!g) return;
    g.position.set(cell.x + (Math.random() - 0.5) * a, cell.y + (Math.random() - 0.5) * a, cell.z);

    // Put the fish sprite where the cube's centre lands on the stage.
    const el = sprites.current.get(player.id);
    if (!el) return;
    g.getWorldPosition(world);
    const dist = world.distanceTo(camera.position);
    world.project(camera);
    const x = ((world.x + 1) / 2) * STAGE_W;
    const y = ((1 - world.y) / 2) * STAGE_H;
    const pxPerUnit = STAGE_H / 2 / TAN_HALF_FOV / dist;
    const scale = (BETTA_UNITS * pxPerUnit) / BETTA_PX;
    el.style.transform = `translate(${x - BETTA_PX / 2}px, ${y - (BETTA_PX * 0.7) / 2}px) scale(${scale})`;
  });

  const count = Math.min(MAX_CRACKS, Math.floor(player.effort / (TAPS_PER_PLAYER / MAX_CRACKS)));
  const cracks = useMemo(() => crackGeometry(player.id, count), [player.id, count]);

  return (
    <group ref={group} position={[cell.x, cell.y, cell.z]}>
      <lineSegments geometry={BOX_EDGES}>
        <lineBasicMaterial color="#a0a0a0" />
      </lineSegments>
      {cracks && (
        <lineSegments geometry={cracks}>
          <lineBasicMaterial color="#f0f0f0" transparent opacity={0.85} />
        </lineSegments>
      )}
    </group>
  );
}

/** Zig-zag cracks on the front face (z = 0.5), seeded by player id so they don't jump. */
function crackGeometry(id: string, count: number) {
  if (!count) return null;
  const rand = seeded(id);
  const points: number[] = [];
  for (let k = 0; k < MAX_CRACKS; k++) {
    const edge = Math.floor(rand() * 4);
    let x = edge === 0 ? -0.5 : edge === 1 ? 0.5 : rand() - 0.5;
    let y = edge === 2 ? 0.5 : edge === 3 ? -0.5 : rand() - 0.5;
    for (let s = 0; s < 4; s++) {
      const nx = x - x * 0.3 + (rand() - 0.5) * 0.22;
      const ny = y - y * 0.3 + (rand() - 0.5) * 0.22;
      if (k < count) points.push(x, y, 0.501, nx, ny, 0.501);
      x = nx;
      y = ny;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
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

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return now;
}
