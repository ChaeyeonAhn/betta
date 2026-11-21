"use client";

// The partitioned tank in 3D. Nothing is there until a betta arrives: every
// cube comes with its fish.
//
//   Visitors' bettas  front row, the cell the server gave them. Each fades in
//                     with its own cube (drei Lines + glass) as it is released.
//   Placeholders      every other cell, front row first and then the rows
//                     behind, fading in one after another over FILL_MS once
//                     the room is complete. Hundreds of cubes, so their lines
//                     are one LineSegments draw and their fish two instanced
//                     draws; each carries a delay and the fade runs on the GPU.

import { PaintedWater } from "@/app/_components/PaintedWater";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  type Group,
  type Material,
  type Mesh,
  ShaderMaterial,
} from "three";
import { FILL_MS, type Genome } from "@/lib/protocol";
import { BettaCanvas, stagePoint } from "./BettaCanvas";
import { BettaModel } from "./BettaModel";
import { GridFillerFish } from "./GridFillerFish";
import { GRID_CAMERA_DISTANCE, type createGridLayout } from "./gridLayout";

type Point = [number, number, number];
type GridPlayer = { id: string; genome: Genome; slot: number };
type Layout = ReturnType<typeof createGridLayout>;

const DEPTH_ROWS = 5;
const Z_PITCH = 1.55;
const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const FOG = "#090f1e";
/** A released betta and its cube fade in over this long. */
const ARRIVE_MS = 1600;
/** Placeholder lines fade over this long (seconds); the fish use the same in bettaMaterial.ts. */
const FADE_S = 1.6;

function cubeEdges([x, y, z]: Point, side: number) {
  const front: Point[] = CORNERS.map(([dx, dy]) => [x + dx * side, y + dy * side, z]);
  const rear: Point[] = front.map(([px, py]) => [px, py, z - side]);
  const frame: Point[] = [];
  const interior: Point[] = [];
  front.forEach((point, i) => {
    const next = (i + 1) % CORNERS.length;
    frame.push(point, front[next]);
    interior.push(rear[i], rear[next], point, rear[i]);
  });
  return { frame, interior };
}

function cubeCenter([x, y, z]: Point, side: number): Point {
  return [x, y, z - side / 2];
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  let h = seed >>> 0 || 2166136261;
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Every placeholder cube in the order it fills: the empty front cells in a
 * shuffled order, then each layer behind, shuffled within the layer. Delays
 * open slowly and quicken, so the first ones arrive one by one.
 */
function buildPlaceholders(layout: Layout, occupied: ReadonlySet<number>) {
  const { slots, side, rows, columns, pitchX, pitchY } = layout;
  type Cell = { front: Point; quiet: boolean };
  const order: Cell[] = seededShuffle(
    slots.flatMap(({ x, y }, i) => (occupied.has(i) ? [] : [{ front: stagePoint(x, y), quiet: true }])),
    17,
  );
  // All layers share world-space X/Y pitch and have Z gaps of their own. Pad
  // the sides so the rows continue beyond the projector's visible edges.
  for (let layer = 0; layer <= DEPTH_ROWS; layer++) {
    const cells: Cell[] = [];
    for (let row = -1; row <= rows; row++) {
      for (let column = -1; column <= columns; column++) {
        const inFrontGrid = row >= 0 && row < rows && column >= 0 && column < columns;
        if (layer === 0 && inFrontGrid) continue;
        const [x, y] = stagePoint((column + 0.5) * pitchX, (row + 0.5) * pitchY);
        cells.push({ front: [x, y, -layer * side * Z_PITCH], quiet: false });
      }
    }
    order.push(...seededShuffle(cells, 101 + layer));
  }

  const total = FILL_MS / 1000 - FADE_S;
  const delays = order.map((_, k) => total * Math.pow(k / Math.max(1, order.length - 1), 0.55));
  const positions: number[] = [];
  const colors: number[] = [];
  const lineDelays: number[] = [];
  const quietFront = new Color("#60646b");
  const quietDepth = new Color("#49566e");
  const distant = new Color("#242936");
  order.forEach(({ front, quiet }, k) => {
    const { frame, interior } = cubeEdges(front, side);
    for (const [points, color] of [[frame, quiet ? quietFront : distant], [interior, quiet ? quietDepth : distant]] as const) {
      for (const p of points) {
        positions.push(...p);
        colors.push(color.r, color.g, color.b);
        lineDelays.push(delays[k]);
      }
    }
  });
  const lines = new BufferGeometry();
  lines.setAttribute("position", new Float32BufferAttribute(positions, 3));
  lines.setAttribute("color", new Float32BufferAttribute(colors, 3));
  lines.setAttribute("delay", new Float32BufferAttribute(lineDelays, 1));
  return { lines, centers: order.map(({ front }) => cubeCenter(front, side)), delays };
}

/**
 * The grid of cubes.
 * `fillStart`: epoch ms the placeholders started (null = not yet). `full`: everything is there already.
 * `arrive`: bettas that mount fade in with their cube, as if just released from a phone.
 */
export function GridTank({ players, layout, fillStart, full, arrive }: {
  players: GridPlayer[];
  layout: Layout;
  fillStart: number | null;
  full: boolean;
  arrive: boolean;
}) {
  const occupiedKey = players.map((p) => p.slot).sort((a, b) => a - b).join(",");
  const placeholders = useMemo(
    () => buildPlaceholders(layout, new Set(occupiedKey ? occupiedKey.split(",").map(Number) : [])),
    [layout, occupiedKey],
  );
  useEffect(() => () => placeholders.lines.dispose(), [placeholders]);
  const clock = useRef({ fillStart, full });
  clock.current = { fillStart, full };
  const elapsed = useMemo(() => () => {
    const { fillStart: start, full: done } = clock.current;
    return done ? 1e6 : start === null ? -1 : (Date.now() - start) / 1000;
  }, []);

  const { slots, side } = layout;
  const endOfGrid = GRID_CAMERA_DISTANCE + (DEPTH_ROWS * Z_PITCH + 1) * side;
  const fogNear = GRID_CAMERA_DISTANCE + side * 0.25;

  return (
    <BettaCanvas background={null} distance={GRID_CAMERA_DISTANCE} scenery={(
      <>
        <PaintedWater variant="deep" />
        <fog attach="fog" args={[FOG, fogNear, endOfGrid]} />
        <PlaceholderLines geometry={placeholders.lines} elapsed={elapsed} fogNear={fogNear} fogFar={endOfGrid} />
      </>
    )}>
      <GridFillerFish centers={placeholders.centers} delays={placeholders.delays} elapsed={elapsed} size={side * 0.39} />
      {players.map((player) => {
        const { x, y } = slots[player.slot];
        return (
          <VisitorCell key={player.id} player={player} x={x} y={y} side={side} arrive={arrive} />
        );
      })}
    </BettaCanvas>
  );
}

/** One visitor's cube and betta, fading in together. */
function VisitorCell({ player, x, y, side, arrive }: { player: GridPlayer; x: number; y: number; side: number; arrive: boolean }) {
  // Lines are drawn around the cube's centre, so their points stay the same objects across renders.
  const { center, frame, interior } = useMemo(() => {
    const front = stagePoint(x, y);
    const middle = cubeCenter(front, side);
    const edges = cubeEdges(front, side);
    const local = (points: Point[]) => points.map(([px, py, pz]): Point => [px - middle[0], py - middle[1], pz - middle[2]]);
    return { center: middle, frame: local(edges.frame), interior: local(edges.interior) };
  }, [x, y, side]);
  const [arrivedAt] = useState(() => (arrive ? Date.now() : null));
  return (
    <FadeIn from={arrivedAt}>
      <group position={center}>
        <Line points={interior} segments color="#97a9c8" lineWidth={1.15} fog toneMapped={false} />
        <Line points={frame} segments color="#f5e4dd" lineWidth={1.6} fog toneMapped={false} />
        {/* The rear glass softens overlapping cells without hiding the grid entirely. */}
        <mesh position={[0, 0, -side / 2 + 1]} renderOrder={1}>
          <planeGeometry args={[side, side]} />
          <meshBasicMaterial color="#030507" opacity={0.56} transparent depthWrite={false} />
        </mesh>
        <mesh position={[0, -side / 2 + 1, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[side, side]} />
          <meshBasicMaterial color="#344052" opacity={0.21} transparent depthWrite={false} side={DoubleSide} />
        </mesh>
        <BettaModel genome={player.genome} seed={player.id} size={side * 0.43} />
      </group>
    </FadeIn>
  );
}

type Faded = Material & { userData: { fade?: { opacity: number; transparent: boolean } } };

/**
 * Fades everything inside in from `from` (epoch ms) over ARRIVE_MS. Walks the
 * subtree each frame while fading, since the betta mounts once its texture loads.
 */
function FadeIn({ from, children }: { from: number | null; children: React.ReactNode }) {
  const group = useRef<Group>(null);
  const start = useRef(from);
  const finished = useRef(from === null);
  useFrame(() => {
    if (finished.current || !group.current || start.current === null) return;
    const t = Math.min(1, Math.max(0, (Date.now() - start.current) / ARRIVE_MS));
    const eased = t * t * (3 - 2 * t);
    group.current.traverse((object) => {
      const material = (object as Mesh).material as Faded | Faded[] | undefined;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) {
        if (!m.userData.fade) {
          m.userData.fade = { opacity: m.opacity, transparent: m.transparent };
          m.transparent = true;
          m.needsUpdate = true;
        }
        m.opacity = m.userData.fade.opacity * eased;
        if (t >= 1) {
          m.transparent = m.userData.fade.transparent;
          m.needsUpdate = true;
          delete m.userData.fade;
        }
      }
    });
    if (t >= 1) finished.current = true;
  });
  return <group ref={group}>{children}</group>;
}

const linesVertex = /* glsl */ `
  attribute float delay;
  uniform float elapsed;
  uniform float fadeTime;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vDepth;
  void main() {
    vColor = color;
    vAlpha = clamp((elapsed - delay) / fadeTime, 0., 1.);
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const linesFragment = /* glsl */ `
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vDepth;
  void main() {
    if (vAlpha < .01) discard;
    vec3 color = mix(vColor, fogColor, smoothstep(fogNear, fogFar, vDepth));
    gl_FragColor = vec4(color, vAlpha);
    #include <colorspace_fragment>
  }
`;

/** Every placeholder cube's edges in one draw; each cube fades in after its own delay. */
function PlaceholderLines({ geometry, elapsed, fogNear, fogFar }: {
  geometry: BufferGeometry;
  elapsed: () => number;
  fogNear: number;
  fogFar: number;
}) {
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: linesVertex,
    fragmentShader: linesFragment,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    uniforms: {
      elapsed: { value: -1 },
      fadeTime: { value: FADE_S },
      fogColor: { value: new Color(FOG) },
      fogNear: { value: fogNear },
      fogFar: { value: fogFar },
    },
  }), [fogNear, fogFar]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    material.uniforms.elapsed.value = elapsed();
  });
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}
