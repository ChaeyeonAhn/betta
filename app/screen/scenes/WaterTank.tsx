"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import { AdditiveBlending, BufferAttribute, DynamicDrawUsage } from "three";
import { PaintedWater } from "@/app/_components/PaintedWater";
import { STAGE_H, STAGE_W } from "./gridLayout";
import { TANK_CAMERA_DISTANCE, TANK_DEPTH, waterAt, type WaterCurrent } from "./waterCurrent";

const HALF_W = STAGE_W / 2;
const HALF_H = STAGE_H / 2;
const particlesVertex = /* glsl */ `
  attribute float glint;
  varying float strength;
  void main() {
    vec4 viewed = modelViewMatrix * vec4(position, 1.0);
    float perspective = ${TANK_CAMERA_DISTANCE.toFixed(1)} / -viewed.z;
    gl_PointSize = max(1.0, (1.5 + glint * 2.7) * perspective);
    strength = glint * perspective * (0.45 + 0.55 * smoothstep(-${HALF_H.toFixed(1)}, ${HALF_H.toFixed(1)}, position.y));
    gl_Position = projectionMatrix * viewed;
  }
`;

const particlesFragment = /* glsl */ `
  varying float strength;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float glow = 1.0 - smoothstep(0.04, 0.50, length(p));
    gl_FragColor = vec4(0.64, 0.75, 0.88, glow * strength * 0.46);
  }
`;

export function WaterTank({ current }: { current: RefObject<WaterCurrent> }) {
  const particles = useMemo(() => {
    const count = 420;
    const position = new Float32Array(count * 3);
    const glint = new Float32Array(count);
    let seed = 7021;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
      position[i * 3] = (random() - 0.5) * STAGE_W;
      position[i * 3 + 1] = (random() - 0.5) * STAGE_H;
      position[i * 3 + 2] = -random() * TANK_DEPTH;
      glint[i] = random();
    }
    return { position, glint };
  }, []);

  return (
    <>
      <PaintedWater current={current} variant="deep" />
      <fog attach="fog" args={["#071327", TANK_CAMERA_DISTANCE + 140, TANK_CAMERA_DISTANCE + TANK_DEPTH * 1.12]} />
      <SuspendedMatter current={current} particles={particles} />
    </>
  );
}

function SuspendedMatter({ current, particles }: {
  current: RefObject<WaterCurrent>;
  particles: { position: Float32Array; glint: Float32Array };
}) {
  const attribute = useMemo(() => new BufferAttribute(particles.position, 3).setUsage(DynamicDrawUsage), [particles]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const positions = particles.position;
    for (let i = 0; i < positions.length; i += 3) {
      const velocity = waterAt(current.current, positions[i] + HALF_W, HALF_H - positions[i + 1], -positions[i + 2]);
      positions[i] += velocity.x * dt;
      positions[i + 1] -= (velocity.y - 4) * dt;
      positions[i + 2] -= velocity.depth * dt;
      if (positions[i] > HALF_W) positions[i] -= STAGE_W;
      else if (positions[i] < -HALF_W) positions[i] += STAGE_W;
      if (positions[i + 1] > HALF_H) positions[i + 1] -= STAGE_H;
      else if (positions[i + 1] < -HALF_H) positions[i + 1] += STAGE_H;
      if (positions[i + 2] > -8) positions[i + 2] -= TANK_DEPTH - 8;
      else if (positions[i + 2] < -TANK_DEPTH) positions[i + 2] += TANK_DEPTH - 8;
    }
    attribute.needsUpdate = true;
  });
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <primitive object={attribute} attach="attributes-position" />
        <bufferAttribute attach="attributes-glint" args={[particles.glint, 1]} />
      </bufferGeometry>
      <shaderMaterial vertexShader={particlesVertex} fragmentShader={particlesFragment}
        transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  );
}
