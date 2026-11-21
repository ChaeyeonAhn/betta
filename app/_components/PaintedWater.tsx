"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Vector2, type ShaderMaterial } from "three";
import { BettaVisual } from "@/app/screen/scenes/BettaCanvas";
import type { WaterCurrent } from "@/app/screen/scenes/waterCurrent";
import { waterSurfaces } from "./waterSurfaces";
import { waterLight } from "./waterLight";

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
  uniform bool deepWater;
  uniform vec2 waterFlow;
  uniform vec2 waterTravel;
  varying vec2 waterUv;

  ${waterSurfaces}
  ${waterLight}

  void main() {
    // Portrait phones see the lit right-hand section of the same environment.
    vec2 viewUv = vec2(.84, .5) + (waterUv - vec2(.84, .5)) * vec2(horizontalView, 1.);
    vec3 ray = normalize(vec3((viewUv - .5) * vec2(2.7, 1.24), -1.));
    vec3 water = waterInk(ray, waterTime, waterFlow, waterTravel, deepWater);
    water += waterScattering(ray, waterTime, waterFlow, waterTravel, deepWater);
    gl_FragColor = vec4(water, 1.);
  }
`;

export function PaintedWater({ current, variant = "seabed" }: {
  current?: RefObject<WaterCurrent>;
  variant?: "seabed" | "deep";
}) {
  const uniforms = useMemo(() => ({
    deepWater: { value: variant === "deep" },
    waterTime: { value: variant === "deep" ? performance.now() / 1000 : 0 }, horizontalView: { value: 1 },
    waterFlow: { value: new Vector2() }, waterTravel: { value: new Vector2() },
  }), [variant]);
  const material = useRef<ShaderMaterial>(null);
  const animate = useRef(true);
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

  useFrame(({ size }, delta) => {
    // R3F copies uniform descriptors on assignment. Update the live material's
    // values, including scalar time and view width, rather than the input props.
    const live = material.current?.uniforms;
    if (!live) return;
    live.horizontalView.value = Math.min(1, size.width / size.height / (2.7 / 1.24));
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

export function WaterBackdrop() {
  return (
    <BettaVisual fallback={null}>
      <Canvas aria-hidden dpr={1} frameloop="demand" resize={{ offsetSize: true }}
        gl={{ antialias: false, alpha: false }}
        style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" }}>
        <PaintedWater />
        <WaterAnimation />
      </Canvas>
    </BettaVisual>
  );
}
