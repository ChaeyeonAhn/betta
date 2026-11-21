"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { DynamicDrawUsage, InstancedBufferAttribute, type InstancedMesh, Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { useBettaAtlas } from "./BettaModel";
import { createBettaMaterial } from "./bettaMaterial";
import { distantBody, distantFins } from "./bettaMesh";

const silhouette = mergeGeometries(distantFins);
const GRAY = { hue: 0, saturation: 0, finLength: 0.65, pattern: 0, seed: 0, filler: true };

/**
 * Grey placeholder bettas, one per cell centre, in two instanced draws.
 * Fish i fades in once `elapsed()` (seconds since the grid started filling)
 * passes `delays[i]`; the fade itself runs in the material (bettaMaterial.ts).
 */
export function GridFillerFish({ centers, delays, elapsed, size }: {
  centers: [number, number, number][];
  delays: number[];
  elapsed: () => number;
  size: number;
}) {
  const bodies = useRef<InstancedMesh>(null);
  const fins = useRef<InstancedMesh>(null);
  const transform = useMemo(() => new Object3D(), []);
  const atlas = useBettaAtlas();
  const [skin, membrane] = useMemo(() => {
    const body = createBettaMaterial(atlas, GRAY, false);
    // Placeholders are see-through while they fade in.
    body.material.transparent = true;
    return [body, createBettaMaterial(atlas, GRAY, true)];
  }, [atlas]);
  // Per-instance delays ride on copies of the shared geometry.
  const [bodyGeometry, finGeometry] = useMemo(() => {
    const delay = new InstancedBufferAttribute(Float32Array.from(delays), 1);
    return [distantBody.clone(), silhouette.clone()].map((geometry) => {
      geometry.setAttribute("fillerDelay", delay);
      return geometry;
    });
  }, [delays]);
  useEffect(() => () => {
    bodyGeometry.dispose();
    finGeometry.dispose();
  }, [bodyGeometry, finGeometry]);

  useEffect(() => () => {
    skin.material.dispose();
    membrane.material.dispose();
  }, [skin, membrane]);

  useFrame(({ clock }) => {
    const bodyMesh = bodies.current;
    const finMesh = fins.current;
    if (!bodyMesh || !finMesh) return;
    const time = clock.elapsedTime;
    membrane.time.value = time * 4.1;
    skin.uniforms.bettaElapsed.value = membrane.uniforms.bettaElapsed.value = elapsed();
    centers.forEach(([x, y, z], i) => {
      const phase = i * 2.39996 + time * (0.45 + (i % 5) * 0.08);
      const facing = i % 2 === 0 ? 1 : -1;
      transform.position.set(
        x + facing * (0.24 + Math.sin(phase) * 0.14) * size,
        y + Math.sin(phase * 1.17) * size * 0.12,
        z + Math.cos(phase * 1.08) * size * 0.18,
      );
      transform.rotation.set(
        Math.sin(phase * 1.4) * 0.09,
        (facing === 1 ? 0 : Math.PI) + Math.cos(phase) * 0.34,
        facing * (0.18 + Math.sin(phase * 1.3) * 0.12),
      );
      transform.scale.setScalar(size);
      transform.updateMatrix();
      bodyMesh.setMatrixAt(i, transform.matrix);
      finMesh.setMatrixAt(i, transform.matrix);
    });
    bodyMesh.instanceMatrix.needsUpdate = true;
    finMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[bodyGeometry, skin.material, centers.length]}
        frustumCulled={false}
        instanceMatrix-usage={DynamicDrawUsage}
      />
      <instancedMesh
        ref={fins}
        args={[finGeometry, membrane.material, centers.length]}
        frustumCulled={false}
        instanceMatrix-usage={DynamicDrawUsage}
      />
    </>
  );
}
