"use client";

// The finished betta, alone in the middle of the phone. Then the camera pulls
// back and it turns out to have been in a cube all along. Swiping lifts the
// betta out of the top of the phone, cube and all. Black, nothing else.
// Loaded with ssr: false (WebGL).

import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type Group, PerspectiveCamera } from "three";
import { BettaCanvas } from "@/app/screen/scenes/BettaCanvas";
import { BettaModel } from "@/app/screen/scenes/BettaModel";
import type { Genome } from "@/lib/protocol";

type Point = [number, number, number];

const SIDE = 200;
const FOV = 50;
const TAN = Math.tan((FOV / 2) * Math.PI / 180);
/** Close enough that the fish fills the phone and its cube barely shows. */
const NEAR_D = 380;
/** Far enough that the cube sits in the middle with room around it. */
const FAR_D = 900;
const HOLD_S = 0.7;
/** The pull back, after which the swipe hint appears (Release.tsx). */
export const REVEAL_S = 3.6;
const LIFT_S = 0.7;

const ease = (t: number) => t * t * (3 - 2 * t);

/** The cube's 12 edges around the fish: the front face bright, the rest quieter. */
function cubeEdges() {
  const h = SIDE / 2;
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
  const frame: Point[] = [];
  const depth: Point[] = [];
  corners.forEach(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % 4];
    frame.push([x, y, h], [nx, ny, h]);
    depth.push([x, y, -h], [nx, ny, -h], [x, y, h], [x, y, -h]);
  });
  return { frame, depth };
}

export function ReleaseScene({ genome, playerId, lift, gone }: {
  genome: Genome;
  playerId: string;
  /** How far the finger has dragged the betta up, in CSS pixels. */
  lift: number;
  gone: boolean;
}) {
  return (
    <BettaCanvas distance={NEAR_D} viewHeight={2 * NEAR_D * TAN} dpr={[1, 2]} background="#000">
      <Rig lift={lift} gone={gone}>
        <BettaModel genome={genome} seed={playerId} size={SIDE * 0.43} calm="drift" />
      </Rig>
    </BettaCanvas>
  );
}

function Rig({ lift, gone, children }: { lift: number; gone: boolean; children: React.ReactNode }) {
  const { camera, size } = useThree();
  const cell = useRef<Group>(null);
  const { frame, depth } = useMemo(cubeEdges, []);
  const clock = useRef({ start: -1, goneAt: -1, liftY: 0 });

  useFrame(({ clock: { elapsedTime: now } }) => {
    const c = clock.current;
    if (c.start < 0) c.start = now;
    const t = now - c.start;
    const d = NEAR_D + (FAR_D - NEAR_D) * ease(Math.min(1, Math.max(0, (t - HOLD_S) / (REVEAL_S - HOLD_S))));
    camera.position.set(0, 0, d);
    if (camera instanceof PerspectiveCamera && camera.far < FAR_D * 3) {
      camera.far = FAR_D * 3;
      camera.updateProjectionMatrix();
    }

    // The finger drags the betta and its cube; let go past the threshold and they fly off the top.
    if (!cell.current) return;
    if (!gone) {
      c.liftY = lift * (2 * d * TAN) / size.height;
      cell.current.position.y = c.liftY;
      return;
    }
    if (c.goneAt < 0) c.goneAt = now;
    const s = Math.min(1, (now - c.goneAt) / LIFT_S);
    cell.current.position.y = c.liftY + s * s * (d * TAN + SIDE * 1.5);
  });

  return (
    <group ref={cell}>
      <Line points={depth} segments color="#97a9c8" lineWidth={1.15} toneMapped={false} />
      <Line points={frame} segments color="#f5e4dd" lineWidth={1.6} toneMapped={false} />
      {children}
    </group>
  );
}
