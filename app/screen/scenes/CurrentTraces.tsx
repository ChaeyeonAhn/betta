"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, SRGBColorSpace } from "three";
import { STAGE_H, STAGE_W } from "./gridLayout";
import { TANK_CAMERA_DISTANCE, TANK_DEPTH, waterAt, type WaterCurrent } from "./waterCurrent";

const AMBIENT_TRACES = 48;
const WAKE_TRACES = 144 * 3;
const COUNT = AMBIENT_TRACES + WAKE_TRACES;
const HISTORY = 25;
const AMBIENT_SAMPLE = 0.14;
const WAKE_SAMPLE = 0.065;
const HALF_W = STAGE_W / 2;
const HALF_H = STAGE_H / 2;
const PALETTE = [[0.95, 0.71, 0.65], [0.57, 0.84, 0.81], [0.73, 0.73, 1], [0.82, 0.89, 0.97]];

const vertex = /* glsl */ `
  attribute float strength;
  attribute float side;
  attribute vec3 pigment;
  varying float traceStrength;
  varying float crossSection;
  attribute float progress;
  varying float traceProgress;
  varying vec3 traceColor;
  void main() {
    traceStrength = strength;
    crossSection = side;
    traceColor = pigment;
    traceProgress = progress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  varying float traceStrength;
  varying float crossSection;
  varying float traceProgress;
  varying vec3 traceColor;
  void main() {
    float core = exp(-crossSection * crossSection * 34.0);
    float halo = exp(-crossSection * crossSection * 6.0);
    float leadingPulse = 1.0 + 1.35 * exp(-traceProgress * traceProgress * 70.0);
    float alpha = (core * .88 + halo * .12) * traceStrength * leadingPulse;
    gl_FragColor = vec4(traceColor, alpha);
  }
`;

type Trace = {
  x: number; y: number; depth: number;
  age: number; life: number; historyTime: number; samples: number;
  width: number; opacity: number; color: number[];
  points: Float32Array;
};

function ownerColor(owner: string) {
  let hash = 2166136261;
  for (const letter of owner) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return PALETTE[(hash >>> 0) % PALETTE.length];
}

/** Particles carry short histories of their actual motion through waterAt. */
export function CurrentTraces({ current, sources }: {
  current: RefObject<WaterCurrent>;
  sources?: RefObject<ReadonlyMap<string, { genome: { hue: number; saturation?: number } }>>;
}) {
  const field = useMemo(() => {
    let seed = 781903;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const traces: Trace[] = Array.from({ length: COUNT }, (_, index) => ({
      x: random() * STAGE_W, y: random() * STAGE_H, depth: 35 + random() * 620, age: index < AMBIENT_TRACES ? random() * 2 : 0,
      life: index < AMBIENT_TRACES ? 3.8 + random() * 2.0 : 0,
      historyTime: 0, samples: 0, width: 3.4, opacity: index < AMBIENT_TRACES ? 0.30 + random() * 0.14 : 0,
      color: [0.27, 0.86, 0.94], points: new Float32Array(HISTORY * 3),
    }));
    const geometry = new BufferGeometry();
    const position = new BufferAttribute(new Float32Array(COUNT * HISTORY * 2 * 3), 3).setUsage(DynamicDrawUsage);
    const strength = new BufferAttribute(new Float32Array(COUNT * HISTORY * 2), 1).setUsage(DynamicDrawUsage);
    const pigment = new BufferAttribute(new Float32Array(COUNT * HISTORY * 2 * 3), 3).setUsage(DynamicDrawUsage);
    const side = new Float32Array(COUNT * HISTORY * 2);
    const progress = new Float32Array(COUNT * HISTORY * 2);
    const indices: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      for (let j = 0; j < HISTORY; j++) {
        const v = (i * HISTORY + j) * 2;
        side[v] = -1;
        side[v + 1] = 1;
        progress[v] = progress[v + 1] = j / (HISTORY - 1);
        if (j < HISTORY - 1) indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    geometry.setAttribute("position", position);
    geometry.setAttribute("strength", strength);
    geometry.setAttribute("pigment", pigment);
    geometry.setAttribute("side", new BufferAttribute(side, 1));
    geometry.setAttribute("progress", new BufferAttribute(progress, 1));
    geometry.setIndex(indices);
    return { traces, geometry, position, strength, pigment, random, sourceColor: new Color(), lastWake: -1, lastTime: 0, nextWake: AMBIENT_TRACES };
  }, []);
  useEffect(() => () => field.geometry.dispose(), [field]);

  useFrame((_, delta) => {
    const water = current.current;
    const dt = Math.min(delta, 0.05);
    if (water.time < field.lastTime) {
      field.lastWake = -1;
      field.traces.forEach((trace) => { trace.samples = 0; trace.opacity = 0; });
    }
    field.lastTime = water.time;

    for (const wake of water.wakes) {
      if (wake.id <= field.lastWake) continue;
      field.lastWake = wake.id;
      const source = sources?.current.get(wake.owner);
      let color = ownerColor(wake.owner);
      if (source) {
        const tint = field.sourceColor.setHSL(source.genome.hue, 0.72, 0.68, SRGBColorSpace);
        tint.convertLinearToSRGB();
        color = [tint.r, tint.g, tint.b];
      }
      const intensity = Math.min(1, wake.strength / 70);
      // Three separately advected parcels reveal the wake's width. The side
      // parcels sit within the force envelope, so its own curl spreads them.
      for (let strand = 0; strand < 3; strand++) {
        const trace = field.traces[field.nextWake];
        field.nextWake = AMBIENT_TRACES + (field.nextWake - AMBIENT_TRACES + 1) % WAKE_TRACES;
        const side = strand === 0 ? 0 : strand === 1 ? -1 : 1;
        const offset = side * wake.radius * 0.48;
        const variation = (wake.id % 7) / 7;
        trace.x = wake.x - wake.dy * offset;
        trace.y = wake.y + wake.dx * offset;
        trace.depth = wake.depth + side * (4 + variation * 5);
        trace.age = side === 0 ? 0 : 0.04 + variation * 0.13;
        trace.life = Math.max(0.5, 2.2 - wake.age + side * 0.16);
        trace.width = (4.5 + intensity * 1.5) * (side === 0 ? 1 : 0.62);
        trace.opacity = (0.38 + intensity * 0.42) * (side === 0 ? 1 : 0.43);
        trace.color = color;
        trace.historyTime = 0;
        trace.samples = 0;
      }
    }

    const positions = field.position.array as Float32Array;
    const strengths = field.strength.array as Float32Array;
    const colors = field.pigment.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      const trace = field.traces[i];
      trace.age += dt;
      if (i < AMBIENT_TRACES && trace.age >= trace.life) {
        trace.depth = 35 + field.random() * 620;
        const visibleScale = 1 + trace.depth / TANK_CAMERA_DISTANCE;
        trace.x = HALF_W + (field.random() - 0.5) * STAGE_W * visibleScale;
        trace.y = HALF_H + ((field.random() + field.random()) * 0.42 - 0.40) * STAGE_H * visibleScale;
        trace.age = 0;
        trace.historyTime = 0;
        trace.samples = 0;
        trace.opacity = 0.28 + field.random() * 0.14;
      }
      if (trace.age >= 0 && trace.age < trace.life && trace.opacity > 0) {
        // Seed a coherent streamline immediately, then replace it with the
        // particle's observed history as the current carries its bright tip.
        if (trace.samples === 0 && i < AMBIENT_TRACES) {
          let x = trace.x;
          let y = trace.y;
          let depth = trace.depth;
          for (let j = 0; j < HISTORY; j++) {
            trace.points[j * 3] = x;
            trace.points[j * 3 + 1] = y;
            trace.points[j * 3 + 2] = depth;
            const past = waterAt(water, x, y, depth);
            x -= past.x * AMBIENT_SAMPLE;
            y -= past.y * AMBIENT_SAMPLE;
            depth -= past.depth * AMBIENT_SAMPLE;
          }
          trace.samples = HISTORY;
        }
        const velocity = waterAt(water, trace.x, trace.y, trace.depth);
        trace.x += velocity.x * dt;
        trace.y += velocity.y * dt;
        trace.depth = Math.max(12, Math.min(TANK_DEPTH - 20, trace.depth + velocity.depth * dt));
        trace.historyTime += dt;
        if (trace.historyTime >= (i < AMBIENT_TRACES ? AMBIENT_SAMPLE : WAKE_SAMPLE) || trace.samples === 0) {
          trace.historyTime = 0;
          trace.points.copyWithin(3, 0, (HISTORY - 1) * 3);
          trace.points[0] = trace.x;
          trace.points[1] = trace.y;
          trace.points[2] = trace.depth;
          trace.samples = Math.min(HISTORY, trace.samples + 1);
        }
      }
      const active = trace.age >= 0 && trace.age < trace.life && trace.samples > 1;
      const fadeIn = Math.min(1, trace.age / (i < AMBIENT_TRACES ? 0.3 : 0.16));
      const fadeOut = Math.min(1, Math.max(0, trace.life - trace.age) / 0.8);
      const visibility = active ? trace.opacity * fadeIn * fadeOut * Math.exp(-trace.depth * 0.00065) : 0;
      for (let j = 0; j < HISTORY; j++) {
        const sample = Math.min(j, Math.max(0, trace.samples - 1));
        const source = sample * 3;
        const prev = Math.max(0, sample - 1) * 3;
        const next = Math.min(Math.max(0, trace.samples - 1), sample + 1) * 3;
        const dx = trace.points[prev] - trace.points[next];
        const dy = trace.points[prev + 1] - trace.points[next + 1];
        const divisor = Math.max(0.1, Math.hypot(dx, dy));
        const acrossX = -dy / divisor * trace.width;
        const acrossY = -dx / divisor * trace.width;
        const along = j / (HISTORY - 1);
        const taper = (1 - along) ** 0.72;
        for (let side = 0; side < 2; side++) {
          const vertexIndex = (i * HISTORY + j) * 2 + side;
          const offset = vertexIndex * 3;
          const sign = side === 0 ? -1 : 1;
          positions[offset] = trace.points[source] - HALF_W + acrossX * sign;
          positions[offset + 1] = HALF_H - trace.points[source + 1] + acrossY * sign;
          positions[offset + 2] = -trace.points[source + 2];
          strengths[vertexIndex] = j < trace.samples ? visibility * taper : 0;
          colors[offset] = trace.color[0];
          colors[offset + 1] = trace.color[1];
          colors[offset + 2] = trace.color[2];
        }
      }
    }
    field.position.needsUpdate = true;
    field.strength.needsUpdate = true;
    field.pigment.needsUpdate = true;
  });

  return (
    <mesh geometry={field.geometry} frustumCulled={false} renderOrder={3}>
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment}
        transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}
