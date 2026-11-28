import { ShaderMaterial, Vector2, type Texture } from "three";
import { waterRoof } from "./waterSurfaces";

export type Uniform<T> = { value: T };

// The panel rides the same height field the pool shader draws: its anchor is
// lifted to the local wave and tilted by the slope, all on the GPU, so it can
// never drift off the visible waves.
const vertex = /* glsl */ `
  uniform float waterTime;
  uniform vec2 anchor;
  uniform float lift;
  uniform float size;
  uniform float yaw;
  uniform float wobble;
  uniform float stretch;
  attribute float layer;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vLayer;

  ${waterRoof}

  void main() {
    float t = waterTime;
    float height = wsRoof(anchor, t, vec2(0.0));
    // A wide step reads the broad swell, not the fine ripples, so panels lean without flipping.
    float e = 0.1;
    float slopeX = (wsRoof(anchor + vec2(e, 0.0), t, vec2(0.0)) - wsRoof(anchor - vec2(e, 0.0), t, vec2(0.0))) / (2.0 * e);
    float slopeZ = (wsRoof(anchor + vec2(0.0, e), t, vec2(0.0)) - wsRoof(anchor - vec2(0.0, e), t, vec2(0.0))) / (2.0 * e);

    vec3 p = position * size;
    float cy = cos(yaw), sy = sin(yaw);
    p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
    float roll = clamp(-atan(slopeX) * 0.45, -0.3, 0.3) + wobble;
    float cr = cos(roll), sr = sin(roll);
    p = vec3(cr * p.x - sr * p.y, sr * p.x + cr * p.y, p.z);
    float tilt = clamp(atan(slopeZ) * 0.45, -0.3, 0.3);
    float ct = cos(tilt), st = sin(tilt);
    p = vec3(p.x, ct * p.y - st * p.z, st * p.y + ct * p.z);
    // The pool is drawn wider than true; squeeze the panel so its shape stays.
    p.x *= stretch;

    vWorld = vec3(anchor.x, height + lift, anchor.y) + p;
    vUv = uv;
    vLayer = layer;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float waterTime;
  uniform sampler2D map;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vLayer;

  ${waterRoof}

  void main() {
    // The front face is the picture; the layers behind it are its darker edge.
    vec4 picture = texture2D(map, vUv);
    bool front = vLayer > 0.999;
    if (picture.a < (front ? 0.02 : 0.5)) discard;
    vec3 color = front ? picture.rgb : picture.rgb * (0.3 + 0.25 * vLayer);
    float coverage = front ? picture.a : 1.0;

    // Below the local wave the panel is seen through the water: tinted, fainter
    // with depth, and a bright meniscus where it breaks the surface.
    float depth = wsRoof(vWorld.xz, waterTime, vec2(0.0)) - vWorld.y;
    float under = smoothstep(-0.003, 0.006, depth);
    float deep = smoothstep(0.0, 0.32, depth);
    color = mix(color, vec3(0.27, 0.35, 0.42), under * (0.45 + 0.45 * deep));
    float meniscus = 1.0 - smoothstep(0.0, 0.007, abs(depth));
    color = mix(color, vec3(0.90, 0.95, 0.96), meniscus * 0.6);
    float alpha = coverage * (1.0 - under * (0.3 + 0.7 * deep));
    gl_FragColor = vec4(color, alpha);
  }
`;

// A splash where a falling icon hits the water: two rings spreading on the
// same wave surface, fading as they go.
const splashVertex = /* glsl */ `
  uniform float waterTime;
  uniform vec2 center;
  uniform float radius;
  varying vec2 vLocal;

  ${waterRoof}

  void main() {
    vLocal = position.xy;
    vec2 at = center + vec2(position.x, -position.y) * radius;
    float height = wsRoof(at, waterTime, vec2(0.0));
    gl_Position = projectionMatrix * viewMatrix * vec4(at.x, height + 0.004, at.y, 1.0);
  }
`;

const splashFragment = /* glsl */ `
  uniform float age;
  varying vec2 vLocal;
  void main() {
    float r = length(vLocal);
    float outer = age * 0.95;
    float inner = max(0.0, age - 0.18) * 0.75;
    float ring = exp(-pow((r - outer) / 0.045, 2.0)) + 0.65 * exp(-pow((r - inner) / 0.035, 2.0));
    float foam = (1.0 - smoothstep(0.0, 0.22, r)) * (1.0 - smoothstep(0.0, 0.3, age)) * 0.8;
    float alpha = (ring + foam) * pow(1.0 - age, 1.4) * step(r, 1.0);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(0.93, 0.97, 0.98, min(1.0, alpha));
  }
`;

export function splashMaterial(waterTime: Uniform<number>, x: number, z: number, radius: number) {
  return new ShaderMaterial({
    uniforms: {
      waterTime,
      center: { value: new Vector2(x, z) },
      radius: { value: radius },
      age: { value: 0 },
    },
    vertexShader: splashVertex,
    fragmentShader: splashFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

/** The picture is sampled raw (no colour space), so it shows as drawn, like the pool shader's colours. */
export function iconMaterial(waterTime: Uniform<number>, map: Texture) {
  return new ShaderMaterial({
    uniforms: {
      waterTime,
      anchor: { value: new Vector2() },
      lift: { value: 0 },
      size: { value: 0.15 },
      yaw: { value: 0 },
      wobble: { value: 0 },
      stretch: { value: 1 },
      map: { value: map },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    toneMapped: false,
  });
}
