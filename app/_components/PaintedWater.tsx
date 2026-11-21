"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Vector2 } from "three";
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
  uniform float brightness;
  uniform vec2 waterFlow;
  uniform vec2 waterTravel;
  varying vec2 waterUv;

  ${waterSurfaces}
  ${waterLight}

  void main() {
    // Portrait phones see the lit right-hand section of the same environment.
    vec2 viewUv = vec2(.84, .5) + (waterUv - vec2(.84, .5)) * vec2(horizontalView, 1.);
    vec3 ray = normalize(vec3((viewUv - .5) * vec2(2.7, 1.24), -1.));
    vec3 water = waterInk(ray, waterTime, waterFlow, waterTravel);
    water += waterScattering(ray, waterTime, waterFlow, waterTravel);
    gl_FragColor = vec4(water * brightness, 1.);
  }
`;

export function PaintedWater({ current, brightness = 1 }: {
  current?: RefObject<WaterCurrent>;
  brightness?: number;
}) {
  const uniforms = useMemo(() => ({
    waterTime: { value: 0 }, horizontalView: { value: 1 }, brightness: { value: brightness },
    waterFlow: { value: new Vector2() }, waterTravel: { value: new Vector2() },
  }), [brightness]);
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
    uniforms.horizontalView.value = Math.min(1, size.width / size.height / (2.7 / 1.24));
    if (!animate.current) return;
    uniforms.waterTime.value += Math.min(delta, .08);
    const water = current?.current;
    if (water) {
      uniforms.waterFlow.value.set(water.x / 78, -water.y / 78);
      uniforms.waterTravel.value.set(water.offsetX * .006, -water.offsetY * .006);
    }
  });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms}
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
