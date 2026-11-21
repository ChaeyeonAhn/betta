"use client";

import { Canvas } from "@react-three/fiber";
import { Component, Suspense, type ReactNode } from "react";
import { STAGE_H, STAGE_W } from "./gridLayout";

const CAMERA_DISTANCE = 3200;

export function stagePoint(x: number, y: number): [number, number, number] {
  return [x - STAGE_W / 2, STAGE_H / 2 - y, 0];
}

export function BettaCanvas({
  children,
  scenery,
  distance = CAMERA_DISTANCE,
  viewHeight = STAGE_H,
  dpr = 1,
  background = "#000",
  gl,
}: {
  children: ReactNode;
  scenery?: ReactNode;
  distance?: number;
  viewHeight?: number;
  dpr?: number | [number, number];
  background?: string | null;
  /** Renderer options, e.g. preserveDrawingBuffer to read the picture back. */
  gl?: { preserveDrawingBuffer?: boolean; alpha?: boolean };
}) {
  const fov = 2 * Math.atan(viewHeight / (2 * distance)) * 180 / Math.PI;
  return (
    <Canvas
      aria-hidden
      dpr={dpr}
      gl={gl}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      resize={{ offsetSize: true }}
      camera={{ position: [0, 0, distance], fov, near: 10, far: 6400 }}
    >
      {background && <color attach="background" args={[background]} />}
      <hemisphereLight args={["#f7fbff", "#6f7995", 2.1]} />
      <directionalLight position={[0, 580, 440]} color="#fff3e8" intensity={2.1} />
      <directionalLight position={[-340, 240, -440]} color="#e6f2ff" intensity={1.6} />
      {scenery}
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}

// Keep the projection usable if a WebGL context or the atlas fails to load.
export class BettaVisual extends Component<{ children: ReactNode; fallback: ReactNode }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
