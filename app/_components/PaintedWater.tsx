"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Matrix3, PerspectiveCamera, Vector2, type ShaderMaterial } from "three";
import { BettaVisual } from "@/app/screen/scenes/BettaCanvas";
import type { WaterCurrent } from "@/app/screen/scenes/waterCurrent";
import { waterSurfaces } from "./waterSurfaces";

const vertex = /* glsl */ `
  varying vec2 waterUv;
  void main() {
    waterUv = uv;
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float waterTime;
  uniform float horizontalView;
  uniform float viewCenter;
  uniform bool followCamera;
  uniform mat3 viewRotation;
  uniform vec2 viewTan;
  uniform bool deepWater;
  uniform vec2 waterFlow;
  uniform vec2 waterTravel;
  varying vec2 waterUv;

  ${waterSurfaces}

  void main() {
    // Portrait phones see a slice of the same environment, by default its lit
    // right-hand section; viewCenter pans that slice across the panorama.
    vec2 viewUv = vec2(viewCenter + (waterUv.x - .5) * horizontalView, waterUv.y);
    vec3 ray = normalize(vec3((viewUv - .5) * vec2(2.7, 1.24), -1.));
    // Inside the grid on a phone, the water surrounds the camera: any direction
    // meets the same bed and surface, so turning around continues the sea.
    if (followCamera) ray = normalize(viewRotation * vec3((waterUv * 2. - 1.) * viewTan, -1.));
    vec3 water = waterInk(ray, waterTime, waterFlow, waterTravel, deepWater);
    gl_FragColor = vec4(water, 1.);
  }
`;

export function PaintedWater({ current, variant = "seabed", look, followCamera = false }: {
  current?: RefObject<WaterCurrent>;
  variant?: "seabed" | "deep";
  /** -1…1: pan a narrow view from the panorama's left edge to its right. */
  look?: () => number;
  /** Draw the water around the actual camera, for a camera that turns. */
  followCamera?: boolean;
}) {
  const uniforms = useMemo(() => ({
    deepWater: { value: variant === "deep" },
    waterTime: { value: variant === "deep" ? performance.now() / 1000 : 0 }, horizontalView: { value: 1 }, viewCenter: { value: .5 },
    followCamera: { value: followCamera }, viewRotation: { value: new Matrix3() }, viewTan: { value: new Vector2(1, 1) },
    waterFlow: { value: new Vector2() }, waterTravel: { value: new Vector2() },
  }), [variant, followCamera]);
  const material = useRef<ShaderMaterial>(null);
  const animate = useRef(true);
  const placed = useRef(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { animate.current = !preference.matches && !document.hidden; };
    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useFrame(({ size, camera }, delta) => {
    // R3F copies uniform descriptors on assignment. Update the live material's
    // values, including scalar time and view width, rather than the input props.
    const live = material.current?.uniforms;
    if (!live) return;
    if (followCamera && camera instanceof PerspectiveCamera) {
      camera.updateMatrixWorld();
      live.viewRotation.value.setFromMatrix4(camera.matrixWorld);
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      live.viewTan.value.set(tan * camera.aspect, tan);
    }
    const view = Math.min(1, size.width / size.height / (2.7 / 1.24));
    live.horizontalView.value = view;
    const rest = .84 - .34 * view;
    const l = Math.max(-1, Math.min(1, look?.() ?? 0));
    const target = l < 0 ? rest + (view / 2 - rest) * -l : rest + (1 - view / 2 - rest) * l;
    live.viewCenter.value = look && placed.current
      ? live.viewCenter.value + (target - live.viewCenter.value) * Math.min(1, delta * 5)
      : target;
    placed.current = true;
    if (!animate.current) return;
    // The two deep scenes share a phase as well as a shader, so opening the
    // cages continues the same surface and light instead of restarting them.
    live.waterTime.value = variant === "deep"
      ? performance.now() / 1000
      : live.waterTime.value + Math.min(delta, .08);
    const water = current?.current;
    if (water) {
      live.waterFlow.value.set(water.x / 78, -water.y / 78);
      live.waterTravel.value.set(water.offsetX * .006, -water.offsetY * .006);
    }
  });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={material} vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms}
        depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

// Standalone water renders at 30 fps while visible. Fish scenes use their own loop.
function WaterAnimation() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      invalidate();
      if (!preference.matches && !document.hidden) timer = setInterval(invalidate, 1000 / 30);
    };
    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [invalidate]);
  return null;
}

export function WaterBackdrop({ look }: { look?: () => number } = {}) {
  return (
    <BettaVisual fallback={null}>
      <Canvas aria-hidden dpr={1} frameloop="demand" resize={{ offsetSize: true }}
        gl={{ antialias: false, alpha: false }}
        style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" }}>
        <PaintedWater look={look} />
        <WaterAnimation />
      </Canvas>
    </BettaVisual>
  );
}
