"use client";

import { PaintedWater } from "@/app/_components/PaintedWater";
import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  type Group,
  type Material,
  type Mesh,
  PerspectiveCamera,
} from "three";
import type { Genome } from "@/lib/protocol";
import { BettaCanvas, stagePoint } from "./BettaCanvas";
import { BettaModel } from "./BettaModel";
import { crackLines } from "./cracks";
import { GridReaction, type GridReactionEvent } from "./GridReaction";
import { GRID_CAMERA_DISTANCE, STAGE_H, STAGE_W, type createGridLayout } from "./gridLayout";

type Point = [number, number, number];
type GridPlayer = { id: string; genome: Genome | null; slot: number };
export const FRY_GENOME: Genome = { hue: 0, saturation: 0, finLength: 0.4, boundary: 0.5, sociability: 0.4 };
type Layout = ReturnType<typeof createGridLayout>;
type Look = { yaw: number; pitch: number };
/** A visitor's phone: the camera sits inside their cell, looking out of the grid. */
export type Pov = { slot: number; id: string; effort: number; look: RefObject<Look> };

const DEPTH_ROWS = 5;
const Z_PITCH = 1.55;
const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const FOG = "#090f1e";
/** When the walls go, a betta in the fading grid hands over to its open-tank copy over this long. */
const RELEASE_MS = 700;

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

const TAN_V = (STAGE_H / 2) / GRID_CAMERA_DISTANCE;
const TAN_H = (STAGE_W / 2) / GRID_CAMERA_DISTANCE;

/** All the empty and occupied cells share a single draw for the lattice edges. */
function buildLattice(layout: Layout, wide: boolean) {
  const { side, rows, columns, pitchX, pitchY } = layout;
  const cells: { front: Point; quiet: boolean }[] = [];
  const reachX = wide ? 48 : 1;
  const reachY = wide ? 24 : 1;
  for (let layer = 0; layer <= DEPTH_ROWS; layer++) {
    for (let row = -reachY; row < rows + reachY; row++) {
      for (let column = -reachX; column < columns + reachX; column++) {
        const [x, y] = stagePoint((column + 0.5) * pitchX, (row + 0.5) * pitchY);
        const z = -layer * side * Z_PITCH;
        const quiet = layer === 0 && row >= 0 && row < rows && column >= 0 && column < columns;
        // Skip cells outside the fixed projection frustum, with room for their back edges.
        const needed = (Math.max(Math.abs(x) / TAN_H, Math.abs(y) / TAN_V) + z) / GRID_CAMERA_DISTANCE;
        if (wide && needed > 1.25) continue;
        cells.push({ front: [x, y, z], quiet });
      }
    }
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const quietFront = new Color("#60646b");
  const quietDepth = new Color("#49566e");
  const distant = new Color("#242936");
  cells.forEach(({ front, quiet }) => {
    const { frame, interior } = cubeEdges(front, side);
    for (const [points, color] of [[frame, quiet ? quietFront : distant], [interior, quiet ? quietDepth : distant]] as const) {
      for (const p of points) {
        positions.push(...p);
        colors.push(color.r, color.g, color.b);
      }
    }
  });
  const lines = new BufferGeometry();
  lines.setAttribute("position", new Float32BufferAttribute(positions, 3));
  lines.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return lines;
}

/** The persistent lattice, from creation through the breaking of the walls. */
export function GridTank({ players, layout, pov, leaving = false, reactions = [] }: {
  players: GridPlayer[];
  layout: Layout;
  pov?: Pov;
  leaving?: boolean;
  reactions?: GridReactionEvent[];
}) {
  const wide = !pov;
  const lattice = useMemo(() => buildLattice(layout, wide), [layout, wide]);
  useEffect(() => () => lattice.dispose(), [lattice]);

  const { slots, side } = layout;
  // Fog begins closer when the visitor is looking out from inside a cell.
  const endOfGrid = pov ? (DEPTH_ROWS * Z_PITCH + 2) * side : GRID_CAMERA_DISTANCE + (DEPTH_ROWS * Z_PITCH + 1) * side;
  const fogNear = pov ? side * 0.6 : GRID_CAMERA_DISTANCE + side * 0.7;

  return (
    <BettaCanvas background={null} distance={GRID_CAMERA_DISTANCE} scenery={(
      <>
        {!leaving && <PaintedWater variant={pov ? "deep" : "seabed"} followCamera={!!pov} />}
        {pov && <PovCamera center={cubeCenter(stagePoint(slots[pov.slot].x, slots[pov.slot].y), side)} side={side} look={pov.look} />}
        <fog attach="fog" args={[FOG, fogNear, endOfGrid]} />
        <lineSegments geometry={lattice}>
          <lineBasicMaterial vertexColors fog depthWrite={false} toneMapped={false} />
        </lineSegments>
      </>
    )}>
      {players.map((player) => {
        const { x, y } = slots[player.slot];
        return (
          <VisitorCell key={player.id} player={player} x={x} y={y} side={side} reactions={reactions.filter(({ playerId }) => playerId === player.id)}
            inside={pov?.id === player.id ? pov.effort : undefined} empty={leaving} />
        );
      })}
    </BettaCanvas>
  );
}

/**
 * A visitor's betta and the highlighted edges of its cell. `inside` (their taps) means
 * the camera is this betta: draw the cube around it, not the fish, and the
 * cracks on the front glass it is looking through.
 */
function VisitorCell({ player, x, y, side, reactions, inside, empty = false }: {
  player: GridPlayer;
  x: number;
  y: number;
  side: number;
  reactions: GridReactionEvent[];
  inside?: number;
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
  return (
    <group position={center}>
      <Line points={interior} segments color="#97a9c8" lineWidth={1.15} fog toneMapped={false} />
      <Line points={frame} segments color="#f5e4dd" lineWidth={1.6} fog toneMapped={false} />
      {empty && player.genome && (
        <FadeIn from={releasedAt} out duration={RELEASE_MS}>
          <BettaModel genome={player.genome} seed={player.id} size={side * 0.43} />
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
            ? <BettaModel genome={player.genome ?? FRY_GENOME} seed={player.id} size={side * 0.43}
                growth={player.genome ? 1 : 0} juvenile>
                {reactions.map((reaction) => (
                  <GridReaction key={reaction.id} reaction={reaction} side={side} />
                ))}
              </BettaModel>
            : <FrontCracks id={player.id} effort={inside} side={side} />}
        </>
      )}
    </group>
  );
}

/** The same cracks the projection draws on this cell, on the front glass, seen from inside. */
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
