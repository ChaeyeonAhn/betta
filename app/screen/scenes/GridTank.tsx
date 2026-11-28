"use client";

// The partitioned tank in 3D, from creation until the walls come down.
//
//   Lattice       every cage, empty or not, in one LineSegments draw. The cages
//                 beyond the resting frame fade in as the camera pulls back.
//   Visitors      their cell's highlighted edges and their betta: a grey fry
//                 that grows into its adult when their feed ends.
//   Placeholders  once everyone is grown (born), grey bettas fill every other
//                 cell over FILL_MS: the cells in view first, then each cube as
//                 the pulling-back camera brings it into frame. Hundreds of
//                 them, so their fish are two instanced draws and each carries
//                 a delay; the fades run on the GPU.
//   Grid stage    each cell breaks on its own. Its betta swims out to the glass
//                 of the cell its visitor is helping and waits there.

import { PaintedWater } from "@/app/_components/PaintedWater";
import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  type Group,
  type Material,
  MathUtils,
  type Mesh,
  PerspectiveCamera,
  ShaderMaterial,
} from "three";
import { FILL_MS, type Genome } from "@/lib/protocol";
import { BettaCanvas, stagePoint } from "./BettaCanvas";
import { BettaModel } from "./BettaModel";
import { crackLines } from "./cracks";
import { GridFillerFish } from "./GridFillerFish";
import { GridReaction, type GridReactionEvent } from "./GridReaction";
import { GRID_CAMERA_DISTANCE, GRID_FISH, helperSpot, STAGE_H, STAGE_W, type createGridLayout, type GridHandoff } from "./gridLayout";
import { swimmingPitch } from "./swimmingPitch";

type Point = [number, number, number];
export type GridPlayer = {
  id: string;
  genome: Genome | null;
  slot: number;
  effort?: number;
  /** Grid stage: out of its cell, at the glass of the `helping` slot. */
  broken?: boolean;
  helping?: number | null;
};
export const FRY_GENOME: Genome = { hue: 0, saturation: 0, finLength: 0.4, boundary: 0.5, sociability: 0.4 };
type Layout = ReturnType<typeof createGridLayout>;
type Look = { yaw: number; pitch: number };
/** A visitor's phone: the camera sits inside their cell, looking out of the grid. */
export type Pov = { slot: number; id: string; effort: number; look: RefObject<Look> };
/** A visitor's phone once their betta is out: the camera faces the glass of the cell they help. */
export type Outside = { id: string; slot: number };

const DEPTH_ROWS = 5;
const Z_PITCH = 1.55;
const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const FOG = "#090f1e";
/** When the walls go, a betta in the fading grid hands over to its open-tank copy over this long. */
const RELEASE_MS = 700;
/** Placeholder lines fade over this long (seconds); the fish use the same in bettaMaterial.ts. */
const FADE_S = 1.6;
/** The projection pulls back to this many times its distance while the placeholders fill. */
const ZOOM_MAX = 2.2;
const FILL_S = FILL_MS / 1000;
const ZOOM_START_S = 1.5;
/** The pull back ends as the last cubes start to fade in. */
const ZOOM_S = FILL_S - FADE_S - ZOOM_START_S;
const TAN_V = (STAGE_H / 2) / GRID_CAMERA_DISTANCE;
const TAN_H = (STAGE_W / 2) / GRID_CAMERA_DISTANCE;
/** Cages this close to the resting frame are there from the start, empty or not. */
const RESTING_REACH = 1.25;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** The projection camera's distance, as a multiple of its resting one, `t` seconds into the fill. */
function zoomAt(t: number) {
  return 1 + (ZOOM_MAX - 1) * smooth(Math.min(1, Math.max(0, (t - ZOOM_START_S) / ZOOM_S)));
}

/** When zoomAt reaches `zoom` (the inverse of the smoothstep). */
function timeForZoom(zoom: number) {
  const e = Math.min(1, Math.max(0, (zoom - 1) / (ZOOM_MAX - 1)));
  const s = 0.5 - Math.sin(Math.asin(1 - 2 * e) / 3);
  return ZOOM_START_S + s * ZOOM_S;
}

function hash01(a: number, b: number, c: number) {
  let h = Math.imul(a + 1013, 73856093) ^ Math.imul(b + 2027, 19349663) ^ Math.imul(c + 3041, 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

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

/**
 * Every cage and every placeholder, with when each fades in. A cube's delay
 * depends only on where it is, so a phone (which may build only the cells
 * near it, `wide` false) sees each one arrive at the same moment as the projection.
 */
function buildGrid(layout: Layout, occupied: ReadonlySet<number>, wide: boolean) {
  const { slots, side, rows, columns, pitchX, pitchY } = layout;
  type Cell = { front: Point; quiet: boolean; fish: number; line: number; seated: boolean };
  const cells: Cell[] = [];
  const reachX = wide ? 48 : 1;
  const reachY = wide ? 24 : 1;
  for (let layer = 0; layer <= DEPTH_ROWS; layer++) {
    for (let row = -reachY; row < rows + reachY; row++) {
      for (let column = -reachX; column < columns + reachX; column++) {
        const inFrontGrid = row >= 0 && row < rows && column >= 0 && column < columns;
        const [x, y] = stagePoint((column + 0.5) * pitchX, (row + 0.5) * pitchY);
        const z = -layer * side * Z_PITCH;
        const quiet = layer === 0 && inFrontGrid;
        // How far back the camera must be for this cube to be in frame.
        const needed = (Math.max(Math.abs(x) / TAN_H, Math.abs(y) / TAN_V) + z - side / 2) / GRID_CAMERA_DISTANCE;
        if (wide && needed > ZOOM_MAX) continue;
        const slot = quiet
          ? slots.findIndex((c) => Math.abs(c.x - (column + 0.5) * pitchX) < 1 && Math.abs(c.y - (row + 0.5) * pitchY) < 1)
          : -1;
        const h = hash01(column, row, layer);
        const fish = quiet
          ? 0.2 + h * 1.6
          : needed <= 1
            ? 0.8 + layer * 0.3 + h * 1.8
            : Math.min(FILL_S - FADE_S, timeForZoom(needed) - 0.3 + h * 0.9);
        const line = !wide || needed <= RESTING_REACH ? -1e3 : fish;
        cells.push({ front: [x, y, z], quiet, fish, line, seated: occupied.has(slot) });
      }
    }
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const lineDelays: number[] = [];
  const quietFront = new Color("#60646b");
  const quietDepth = new Color("#49566e");
  const distant = new Color("#242936");
  cells.forEach(({ front, quiet, line }) => {
    const { frame, interior } = cubeEdges(front, side);
    for (const [points, color] of [[frame, quiet ? quietFront : distant], [interior, quiet ? quietDepth : distant]] as const) {
      for (const p of points) {
        positions.push(...p);
        colors.push(color.r, color.g, color.b);
        lineDelays.push(line);
      }
    }
  });
  const lines = new BufferGeometry();
  lines.setAttribute("position", new Float32BufferAttribute(positions, 3));
  lines.setAttribute("color", new Float32BufferAttribute(colors, 3));
  lines.setAttribute("delay", new Float32BufferAttribute(lineDelays, 1));
  const empty = cells.filter((cell) => !cell.seated);
  return { lines, centers: empty.map(({ front }) => cubeCenter(front, side)), delays: empty.map((cell) => cell.fish) };
}

/**
 * The grid of cubes.
 * `fillStart`: local epoch ms the placeholders started (null = not yet). `full`: everything is there already.
 * `pov`: render from inside one visitor's cell; `outside`: from in front of the cell they help.
 * `leaving`: only the cubes and the fading bettas, on a clear background, so
 * the open tank shows through while the grid fades away.
 */
export function GridTank({ players, layout, fillStart = null, full = false, pov, outside, leaving = false, reactions = [], handoff }: {
  players: GridPlayer[];
  layout: Layout;
  fillStart?: number | null;
  full?: boolean;
  pov?: Pov;
  outside?: Outside;
  leaving?: boolean;
  reactions?: GridReactionEvent[];
  /** Projection only: freed bettas report where they are, for the open tank to start them there. */
  handoff?: GridHandoff;
}) {
  const wide = !pov;
  const occupiedKey = players.map((p) => p.slot).sort((a, b) => a - b).join(",");
  const grid = useMemo(
    () => buildGrid(layout, new Set(occupiedKey ? occupiedKey.split(",").map(Number) : []), wide),
    [layout, occupiedKey, wide],
  );
  useEffect(() => () => grid.lines.dispose(), [grid]);
  const clock = useRef({ fillStart, full });
  clock.current = { fillStart, full };
  const elapsed = useMemo(() => () => {
    const { fillStart: start, full: done } = clock.current;
    return done ? 1e6 : start === null ? -1 : (Date.now() - start) / 1000;
  }, []);

  const { slots, side } = layout;
  const me = pov?.id ?? outside?.id;
  // Fog distances are measured from the camera: the middle of a cell, in front
  // of the glass, or the projection's camera, which moves (ProjectionCamera keeps the fog with it).
  const endOfGrid = pov ? (DEPTH_ROWS * Z_PITCH + 2) * side
    : outside ? (DEPTH_ROWS * Z_PITCH + 3) * side
    : GRID_CAMERA_DISTANCE + (DEPTH_ROWS * Z_PITCH + 1) * side;
  const fogNear = pov ? side * 0.6 : outside ? side * 1.6 : GRID_CAMERA_DISTANCE + side * 0.7;

  return (
    <BettaCanvas background={null} distance={GRID_CAMERA_DISTANCE} scenery={(
      <>
        {!leaving && <PaintedWater variant={pov || outside ? "deep" : "seabed"} followCamera={!!pov} />}
        {pov && <PovCamera center={cubeCenter(stagePoint(slots[pov.slot].x, slots[pov.slot].y), side)} side={side} look={pov.look} />}
        {outside && <OutsideCamera slot={slots[outside.slot]} side={side} />}
        {!pov && !outside && <ProjectionCamera elapsed={elapsed} pullBack={!full} side={side} />}
        <fog attach="fog" args={[FOG, fogNear, endOfGrid]} />
        <LatticeLines geometry={grid.lines} elapsed={elapsed} />
      </>
    )}>
      <GridFillerFish centers={grid.centers} delays={grid.delays} elapsed={elapsed} size={side * 0.39} />
      {players.map((player) => {
        const { x, y } = slots[player.slot];
        return (
          <VisitorCell key={player.id} player={player} x={x} y={y} side={side}
            reactions={reactions.filter(({ playerId }) => playerId === player.id)}
            inside={pov?.id === player.id ? pov.effort : undefined}
            cracked={outside?.slot === player.slot ? player.effort ?? 0 : undefined}
            empty={leaving} />
        );
      })}
      {players.map((player) => player.broken && player.genome && player.id !== me && (
        <FreeBetta key={player.id} player={player} genome={player.genome} layout={layout} leaving={leaving} handoff={handoff} />
      ))}
    </BettaCanvas>
  );
}

/**
 * A visitor's betta and the highlighted edges of its cell. `inside` (their taps) means
 * the camera is this betta: draw the cube around it, not the fish, and the
 * cracks on the front glass it is looking through. `cracked`: the camera is in
 * front of this cell, so draw its cracks on the glass from outside too.
 */
function VisitorCell({ player, x, y, side, reactions, inside, cracked, empty = false }: {
  player: GridPlayer;
  x: number;
  y: number;
  side: number;
  reactions: GridReactionEvent[];
  inside?: number;
  cracked?: number;
  /** The walls are down: just the cube's lines, and the betta fading quickly as the open tank's copy takes over. */
  empty?: boolean;
}) {
  // Lines are drawn around the cube's centre, so their points stay the same objects across renders.
  const { center, frame, interior } = useMemo(() => {
    const front = stagePoint(x, y);
    const middle = cubeCenter(front, side);
    const edges = cubeEdges(front, side);
    const local = (points: Point[]) => points.map(([px, py, pz]): Point => [px - middle[0], py - middle[1], pz - middle[2]]);
    return { center: middle, frame: local(edges.frame), interior: local(edges.interior) };
  }, [x, y, side]);
  const [releasedAt] = useState(Date.now);
  const broken = !!player.broken;
  return (
    <group position={center}>
      <Line points={interior} segments color="#97a9c8" lineWidth={1.15} fog toneMapped={false}
        transparent={broken} opacity={broken ? 0.45 : 1} />
      {/* A broken cell has lost its front glass. */}
      {!broken && <Line points={frame} segments color="#f5e4dd" lineWidth={1.6} fog toneMapped={false} />}
      {empty && player.genome && !broken && (
        <FadeIn from={releasedAt} out duration={RELEASE_MS}>
          <BettaModel genome={player.genome} seed={player.id} size={side * GRID_FISH} />
        </FadeIn>
      )}
      {!empty && (
        <>
          {/* The rear glass softens overlapping cells without hiding the grid entirely. */}
          <mesh position={[0, 0, -side / 2 + 1]} renderOrder={1}>
            <planeGeometry args={[side, side]} />
            <meshBasicMaterial color="#030507" opacity={0.56} transparent depthWrite={false} />
          </mesh>
          <mesh position={[0, -side / 2 + 1, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
            <planeGeometry args={[side, side]} />
            <meshBasicMaterial color="#344052" opacity={0.21} transparent depthWrite={false} side={DoubleSide} />
          </mesh>
          {inside === undefined
            ? !broken && <BettaModel genome={player.genome ?? FRY_GENOME} seed={player.id} size={side * GRID_FISH}
                growth={player.genome ? 1 : 0} juvenile />
            : !broken && <FrontCracks id={player.id} effort={inside} side={side} />}
          {cracked !== undefined && !broken && <FrontCracks id={player.id} effort={cracked} side={side} />}
          {reactions.map((reaction) => (
            <GridReaction key={reaction.id} reaction={reaction} side={side} base={center} />
          ))}
        </>
      )}
    </group>
  );
}

/**
 * A betta whose cell broke: it swims out through the open front to the glass
 * of the cell its visitor helps, waits there, and moves on when that one breaks.
 */
function FreeBetta({ player, genome, layout, leaving, handoff }: {
  player: GridPlayer;
  genome: Genome;
  layout: Layout;
  leaving: boolean;
  handoff?: GridHandoff;
}) {
  const { slots, side } = layout;
  const group = useRef<Group>(null);
  const target = slots[player.helping ?? player.slot] ?? slots[player.slot];
  const goal = useRef<Point>([0, 0, 0]);
  const spot = helperSpot(player.id, target, side);
  const [goalX, goalY] = stagePoint(spot.x, spot.y);
  goal.current = [goalX, goalY, spot.z];
  const motion = useRef<{ p: Point; v: Point; dir: 1 | -1 } | null>(null);
  const [fadeFrom] = useState(Date.now);

  useFrame(({ clock }, delta) => {
    const object = group.current;
    if (!object) return;
    const dt = Math.min(delta, 0.05);
    const home = cubeCenter(stagePoint(slots[player.slot].x, slots[player.slot].y), side);
    const m = motion.current ??= { p: leaving ? [...goal.current] : home, v: [0, 0, 0], dir: 1 };
    if (!leaving) {
      // A soft spring with a speed limit: it leaves its cell in a hurry and settles at the glass.
      for (let i = 0; i < 3; i++) m.v[i] += ((goal.current[i] - m.p[i]) * 5 - m.v[i] * 3.4) * dt;
      const speed = Math.hypot(...m.v);
      if (speed > 320) m.v = m.v.map((v) => v * 320 / speed) as Point;
      for (let i = 0; i < 3; i++) m.p[i] += m.v[i] * dt;
    }
    const t = clock.elapsedTime + player.id.length;
    object.position.set(m.p[0], m.p[1] + Math.sin(t * 1.3) * side * 0.03, m.p[2]);
    // Face where it swims; at rest, face the glass's middle.
    if (m.v[0] > 12) m.dir = 1;
    else if (m.v[0] < -12) m.dir = -1;
    else if (Math.hypot(...m.v) < 6) m.dir = goal.current[0] < stagePoint(target.x, target.y)[0] ? 1 : -1;
    object.rotation.y = MathUtils.damp(object.rotation.y, m.dir === 1 ? 0 : Math.PI, 6, dt);
    // Climbing or diving to another row, it leans into it without standing on its tail.
    object.rotation.z = MathUtils.clamp(swimmingPitch(m.v[0], -m.v[1]), -0.55, 0.55);
    // Seen from the projection's resting camera.
    const scale = GRID_CAMERA_DISTANCE / (GRID_CAMERA_DISTANCE - object.position.z);
    handoff?.set(player.id, {
      x: STAGE_W / 2 + object.position.x * scale,
      y: STAGE_H / 2 - object.position.y * scale,
      size: side * GRID_FISH * scale,
    });
  });

  const fish = <BettaModel genome={genome} seed={player.id} size={side * GRID_FISH} followHeading />;
  return (
    <group ref={group}>
      {leaving ? <FadeIn from={fadeFrom} out duration={RELEASE_MS}>{fish}</FadeIn> : fish}
    </group>
  );
}

/** The same cracks the projection draws on this cell, on the front glass. */
function FrontCracks({ id, effort, side }: { id: string; effort: number; side: number }) {
  const lines = useMemo(
    () => crackLines(id, effort).map((line) =>
      line.map(([u, v]): Point => [(u - 0.5) * side, (0.5 - v) * side, side / 2 + 0.5])),
    [id, effort, side],
  );
  return (
    <>
      {lines.map((points, k) => (
        <Line key={k} points={points} color="#e8e8e8" lineWidth={1.4} transparent opacity={0.8} toneMapped={false} />
      ))}
    </>
  );
}

const rad = Math.PI / 180;

/**
 * The projection's camera. While the placeholders fill it pulls straight back
 * (zoomAt), so the tank seems to go on and on; for the grid stage it eases
 * back in, so the cells sit where the cracks and the open tank expect them.
 * The fog moves with it.
 */
function ProjectionCamera({ elapsed, pullBack, side }: { elapsed: () => number; pullBack: boolean; side: number }) {
  const { camera, scene } = useThree();
  useFrame((_, delta) => {
    const target = GRID_CAMERA_DISTANCE * (pullBack ? zoomAt(elapsed()) : 1);
    const z = camera.position.z;
    camera.position.z = pullBack ? target : z + (target - z) * Math.min(1, delta * 1.4);
    if (scene.fog instanceof Fog) {
      scene.fog.near = camera.position.z + side * 0.7;
      scene.fog.far = camera.position.z + (DEPTH_ROWS * Z_PITCH + 1) * side;
    }
  });
  return null;
}

/** The phone's camera once its betta is out: in front of the glass it is helping to break, easing to the next one. */
function OutsideCamera({ slot, side }: { slot: { x: number; y: number }; side: number }) {
  const camera = useThree((state) => state.camera);
  const placed = useRef(false);
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.fov = 64;
    camera.near = side * 0.05;
    camera.far = (DEPTH_ROWS * Z_PITCH + 6) * side;
    camera.updateProjectionMatrix();
  }, [camera, side]);
  useFrame((_, delta) => {
    const [x, y] = stagePoint(slot.x, slot.y);
    const z = side * 1.45;
    const k = placed.current ? Math.min(1, delta * 3) : 1;
    placed.current = true;
    camera.position.set(
      camera.position.x + (x - camera.position.x) * k,
      camera.position.y + (y - camera.position.y) * k,
      camera.position.z + (z - camera.position.z) * k,
    );
    camera.rotation.set(0, 0, 0);
  });
  return null;
}

/**
 * The phone's camera, inside its cell. It faces out of the grid (+z),
 * so turning right looks toward −x: the cells to the visitor's left on the
 * projection, exactly as they would be for a fish looking back at the room.
 */
function PovCamera({ center, side, look }: { center: Point; side: number; look: RefObject<Look> }) {
  const camera = useThree((state) => state.camera);
  const eased = useRef<Look | null>(null);
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.fov = 80;
    camera.near = side * 0.05;
    camera.far = (DEPTH_ROWS * Z_PITCH + 4) * side;
    camera.updateProjectionMatrix();
  }, [camera, side]);
  useFrame((_, delta) => {
    const target = look.current ?? { yaw: 0, pitch: 0 };
    const now = eased.current ?? { ...target };
    const k = Math.min(1, delta * 10);
    now.yaw += (target.yaw - now.yaw) * k;
    now.pitch += (target.pitch - now.pitch) * k;
    eased.current = now;
    // Sit toward the back of the cell, so the open front frames the view.
    camera.position.set(center[0], center[1], center[2] - side * 0.25);
    camera.rotation.set(now.pitch * rad, Math.PI - now.yaw * rad, 0, "YXZ");
  });
  return null;
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

/** The cages' edges: the near ones always, the far ones as the fill reaches them. */
function LatticeLines({ geometry, elapsed }: { geometry: BufferGeometry; elapsed: () => number }) {
  const scene = useThree((state) => state.scene);
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
      fogNear: { value: 0 },
      fogFar: { value: 1 },
    },
  }), []);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    material.uniforms.elapsed.value = elapsed();
    if (scene.fog instanceof Fog) {
      material.uniforms.fogNear.value = scene.fog.near;
      material.uniforms.fogFar.value = scene.fog.far;
    }
  });
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}

type Faded = Material & { userData: { fade?: { opacity: number; transparent: boolean } } };

/**
 * Fades everything inside in (or `out`) from `from` (epoch ms) over `duration`.
 * Walks the subtree each frame while fading, since the betta mounts once its texture loads.
 */
function FadeIn({ from, out = false, duration = RELEASE_MS, children }: {
  from: number | null;
  out?: boolean;
  duration?: number;
  children: React.ReactNode;
}) {
  const group = useRef<Group>(null);
  const start = useRef(from);
  const finished = useRef(from === null);
  useFrame(() => {
    if (finished.current || !group.current || start.current === null) return;
    const t = Math.min(1, Math.max(0, (Date.now() - start.current) / duration));
    const eased = out ? 1 - t * t * (3 - 2 * t) : t * t * (3 - 2 * t);
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
        if (t >= 1 && !out) {
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
