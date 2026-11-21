"use client";

import { PaintedWater } from "@/app/_components/PaintedWater";
import { Line } from "@react-three/drei";
import { useMemo } from "react";
import { DoubleSide } from "three";
import type { Genome } from "@/lib/protocol";
import { BettaCanvas, stagePoint } from "./BettaCanvas";
import { BettaModel } from "./BettaModel";
import { GridFillerFish } from "./GridFillerFish";
import { GRID_CAMERA_DISTANCE, type createGridLayout } from "./gridLayout";

type Point = [number, number, number];
type GridPlayer = { id: string; genome: Genome };
type Layout = ReturnType<typeof createGridLayout>;

const DEPTH_ROWS = 5;
const Z_PITCH = 1.55;
const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

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

function buildScene(layout: Layout, count: number) {
  const { slots, side, rows, columns, pitchX, pitchY } = layout;
  const activeCorners: Point[] = [];
  const activeDepth: Point[] = [];
  const quietFronts: Point[] = [];
  const quietDepth: Point[] = [];
  const distant: Point[] = [];
  const fillerCenters: Point[] = [];

  slots.forEach(({ x, y }, i) => {
    const front = stagePoint(x, y);
    const { frame, interior } = cubeEdges(front, side);
    if (i < count) {
      activeCorners.push(...frame);
      activeDepth.push(...interior);
    } else {
      quietFronts.push(...frame);
      quietDepth.push(...interior);
      fillerCenters.push(cubeCenter(front, side));
    }
  });

  // All layers share world-space X/Y pitch and have Z gaps of their own. Pad
  // the sides so the rows continue beyond the projector's visible edges.
  for (let layer = 0; layer <= DEPTH_ROWS; layer++) {
    for (let row = -1; row <= rows; row++) {
      for (let column = -1; column <= columns; column++) {
        const inFrontGrid = row >= 0 && row < rows && column >= 0 && column < columns;
        if (layer === 0 && inFrontGrid) continue;
        const [x, y] = stagePoint((column + 0.5) * pitchX, (row + 0.5) * pitchY);
        const front: Point = [x, y, -layer * side * Z_PITCH];
        const { frame, interior } = cubeEdges(front, side);
        distant.push(...frame, ...interior);
        fillerCenters.push(cubeCenter(front, side));
      }
    }
  }

  return { activeCorners, activeDepth, quietFronts, quietDepth, distant, fillerCenters };
}

export function GridTank({ players, layout }: { players: GridPlayer[]; layout: Layout }) {
  const count = players.length;
  const scene = useMemo(() => buildScene(layout, count), [layout, count]);
  const { slots, side } = layout;
  const fishSize = side * 0.43;
  const endOfGrid = GRID_CAMERA_DISTANCE + (DEPTH_ROWS * Z_PITCH + 1) * side;

  return (
    <BettaCanvas background={null} distance={GRID_CAMERA_DISTANCE} scenery={(
      <>
        <PaintedWater variant="deep" />
        <fog attach="fog" args={["#090f1e", GRID_CAMERA_DISTANCE + side * 0.25, endOfGrid]} />
        <Line points={scene.distant} segments color="#242936" lineWidth={0.78} fog toneMapped={false} />
        {scene.quietFronts.length > 0 && (
          <>
            <Line points={scene.quietDepth} segments color="#49566e" lineWidth={0.9} fog toneMapped={false} />
            <Line points={scene.quietFronts} segments color="#60646b" lineWidth={1.1} fog toneMapped={false} />
          </>
        )}
        {scene.activeCorners.length > 0 && (
          <>
            <Line points={scene.activeDepth} segments color="#97a9c8" lineWidth={1.15} fog toneMapped={false} />
            <Line points={scene.activeCorners} segments color="#f5e4dd" lineWidth={1.6} fog toneMapped={false} />
          </>
        )}
      </>
    )}>
      <GridFillerFish centers={scene.fillerCenters} size={side * 0.39} />
      {players.map((player, i) => {
        const { x, y } = slots[i];
        const front = stagePoint(x, y);
        return (
          <group key={player.id} position={cubeCenter(front, side)}>
            {/* The rear glass softens overlapping cells without hiding the grid entirely. */}
            <mesh position={[0, 0, -side / 2 + 1]} renderOrder={1}>
              <planeGeometry args={[side, side]} />
              <meshBasicMaterial color="#030507" opacity={0.56} transparent depthWrite={false} />
            </mesh>
            <mesh position={[0, -side / 2 + 1, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
              <planeGeometry args={[side, side]} />
              <meshBasicMaterial color="#344052" opacity={0.21} transparent depthWrite={false} side={DoubleSide} />
            </mesh>
            <BettaModel genome={player.genome} seed={player.id} size={fishSize} />
          </group>
        );
      })}
    </BettaCanvas>
  );
}
