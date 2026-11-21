"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import { AdditiveBlending, BoxGeometry, BufferAttribute, DynamicDrawUsage, EdgesGeometry, TextureLoader, Vector2 } from "three";
import { STAGE_H, STAGE_W } from "./gridLayout";
import { TANK_CAMERA_DISTANCE, TANK_DEPTH, waterAt, type WaterCurrent } from "./waterCurrent";

const HALF_W = STAGE_W / 2;
const HALF_H = STAGE_H / 2;
const HALF_D = TANK_DEPTH / 2;
const box = new BoxGeometry(STAGE_W, STAGE_H, TANK_DEPTH);
const edges = new EdgesGeometry(box).translate(0, 0, -HALF_D);
box.dispose();

const surfaceVertex = /* glsl */ `
  varying vec3 waterPosition;
  void main() {
    waterPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(waterPosition, 1.0);
  }
`;

const surfaceFragment = /* glsl */ `
  varying vec3 waterPosition;
  uniform float time;
  uniform vec2 drift;
  uniform float face;
  uniform sampler2D engraving;

  float caustic(vec2 p) {
    vec2 fold = vec2(sin(p.y * 1.1 + time * 0.63), cos(p.x * 0.79 - time * 0.48));
    p += fold * 0.88;
    float wave = sin(p.x + cos(p.y * 0.78)) + sin(p.y * 1.23);
    float fine = cos(p.x * 1.7 - p.y * 0.92 + time * 0.37);
    return pow(clamp(1.0 - abs(wave + fine * 0.33), 0.0, 1.0), 11.0);
  }

  void main() {
    float depth = clamp(-waterPosition.z / ${TANK_DEPTH.toFixed(1)}, 0.0, 1.0);
    float height = clamp(waterPosition.y / ${STAGE_H.toFixed(1)} + 0.5, 0.0, 1.0);
    vec2 p = face < 2.0 ? waterPosition.xz : waterPosition.xy;
    if (face > 2.5) p = waterPosition.zy;
    p = (p - drift * vec2(0.75, -0.65)) * 0.025;
    float light = caustic(p);
    float haze = sin(p.x * 0.32 + p.y * 0.14) * cos(p.y * 0.31 - p.x * 0.12) * 0.5 + 0.5;
    float sunOffset = (waterPosition.x - 550.0 + depth * 170.0) / 540.0;
    float sunlight = exp(-sunOffset * sunOffset);
    // Project the etching continuously over the rear and side panes. Refraction
    // adds a different displacement at each depth as the real current shifts.
    float perspective = ${TANK_CAMERA_DISTANCE.toFixed(1)} / (${TANK_CAMERA_DISTANCE.toFixed(1)} - waterPosition.z);
    vec2 plateUv = .5 + waterPosition.xy * perspective / vec2(${STAGE_W.toFixed(1)}, ${STAGE_H.toFixed(1)});
    plateUv += .003 * vec2(sin(p.y*.7+time*.38), cos(p.x*.84-time*.29));
    vec3 printColor = pow(texture2D(engraving, clamp(plateUv,0.,1.)).rgb, vec3(2.2));
    float surface = 1.0 - step(1.5, face);
    vec3 color = vec3(.003,.009,.024) + printColor * (.58+.35*surface);
    color += vec3(.019,.083,.14) * (.15*haze+sunlight*(.10+.20*height));
    float grain = fract(sin(dot(floor(waterPosition.xy*.78+waterPosition.z*.34),vec2(41.47,17.12))) * 12523.74);
    color += vec3(.08,.29,.42) * light * (.16+.84*surface)*(.24+.76*sunlight)*(.40+.60*grain);
    color *= 1.-depth*.18;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const lightVertex = /* glsl */ `
  varying vec2 beamUv;
  void main() {
    beamUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lightFragment = /* glsl */ `
  varying vec2 beamUv;
  uniform float time;
  uniform vec2 flow;
  uniform float layer;

  void main() {
    vec2 uv = beamUv;
    vec2 bend = flow * 0.00055 * (1.0 - uv.y);
    float shaft = 0.0;
    for (int i = 0; i < 5; i++) {
      float index = float(i);
      float source = 0.54 + index * 0.080 + layer * 0.019;
      float spread = 0.012 + (1.0 - uv.y) * (0.017 + index * 0.004);
      float x = uv.x - source - bend.x + (1.0 - uv.y) * (0.220 - index * 0.022);
      x += sin(time * 0.34 + uv.y * 5.5 + index) * 0.014;
      float distance = x / spread;
      shaft += exp(-distance * distance) * (0.48 + 0.24 * sin(time * 0.7 + index + uv.y * 4.0));
    }
    float falloff = pow(smoothstep(0.02, 0.90, uv.y + bend.y), 1.55);
    float edges = smoothstep(0.0, 0.13, uv.x) * (1.0 - smoothstep(0.87, 1.0, uv.x));
    gl_FragColor = vec4(0.28, 0.55, 0.76, shaft * falloff * edges * (0.30 - layer * 0.075));
  }
`;

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
    gl_FragColor = vec4(0.46, 0.74, 0.69, glow * strength * 0.68);
  }
`;

const PANELS = [
  { position: [0, -HALF_H, -HALF_D], rotation: [-Math.PI / 2, 0, 0], width: STAGE_W, height: TANK_DEPTH },
  { position: [0, HALF_H, -HALF_D], rotation: [Math.PI / 2, 0, 0], width: STAGE_W, height: TANK_DEPTH },
  { position: [0, 0, -TANK_DEPTH], rotation: [0, 0, 0], width: STAGE_W, height: STAGE_H },
  { position: [-HALF_W, 0, -HALF_D], rotation: [0, Math.PI / 2, 0], width: TANK_DEPTH, height: STAGE_H },
  { position: [HALF_W, 0, -HALF_D], rotation: [0, -Math.PI / 2, 0], width: TANK_DEPTH, height: STAGE_H },
] satisfies { position: [number, number, number]; rotation: [number, number, number]; width: number; height: number }[];

export function WaterTank({ current }: { current: RefObject<WaterCurrent> }) {
  const engraving = useLoader(TextureLoader, "/night-water.webp");
  const uniforms = useMemo(() => {
    const time = { value: 0 };
    const drift = { value: new Vector2() };
    const flow = { value: new Vector2() };
    return {
      time,
      drift,
      flow,
      panels: PANELS.map((_, face) => ({ time, drift, engraving: { value: engraving }, face: { value: face } })),
      beams: [0, 1].map((layer) => ({ time, flow, layer: { value: layer } })),
    };
  }, [engraving]);

  const particles = useMemo(() => {
    const count = 720;
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

  useFrame(() => {
    const water = current.current;
    uniforms.time.value = water.time;
    uniforms.drift.value.set(water.offsetX, water.offsetY);
    uniforms.flow.value.set(water.x, water.y);
  });

  return (
    <>
      <fog attach="fog" args={["#102b36", TANK_CAMERA_DISTANCE + 140, TANK_CAMERA_DISTANCE + TANK_DEPTH * 1.12]} />
      {PANELS.map((panel, i) => (
        <mesh key={i} position={panel.position} rotation={panel.rotation}>
          <planeGeometry args={[panel.width, panel.height]} />
          <shaderMaterial vertexShader={surfaceVertex} fragmentShader={surfaceFragment} uniforms={uniforms.panels[i]} />
        </mesh>
      ))}
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#5d878b" transparent opacity={0.42} depthWrite={false} />
      </lineSegments>
      {uniforms.beams.map((beam, i) => (
        <mesh key={i} position={[0, 0, -220 - i * 340]}>
          <planeGeometry args={[STAGE_W, STAGE_H]} />
          <shaderMaterial vertexShader={lightVertex} fragmentShader={lightFragment} uniforms={beam}
            transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      ))}
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
