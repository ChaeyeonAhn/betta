"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Matrix3, PerspectiveCamera, Vector2, type ShaderMaterial } from "three";
import { BettaVisual } from "@/app/screen/scenes/BettaCanvas";
import type { WaterCurrent } from "@/app/screen/scenes/waterCurrent";
import { entryWaterShader } from "./entryWaterShader";
import { SurfaceIcons, type EntryClock, type Floater } from "./SurfaceIcons";
import { WATER_ENTRY_MS, type WaterEntry } from "./waterEntry";
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
// `steered`: someone is looking around in it, so keep drawing even with
// reduced motion (PaintedWater then holds the water still and only pans).
function WaterAnimation({ steered = false }: { steered?: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      invalidate();
      if ((steered || !preference.matches) && !document.hidden) timer = setInterval(invalidate, 1000 / 30);
    };
    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [invalidate, steered]);
  return null;
}

function EntryWater({ entry, floaters }: { entry: WaterEntry; floaters?: readonly Floater[] | null }) {
  const invalidate = useThree((state) => state.invalidate);
  const material = useRef<ShaderMaterial>(null);
  const motion = useRef<MediaQueryList | null>(null);
  const startedAt = useRef(0);
  // Update the live uniforms across stage changes without rebuilding the material.
  // The icons on the water read these same uniforms, so they ride the same waves and dive.
  const uniforms = useMemo<EntryClock>(() => ({
    waterTime: { value: 0 },
    diveProgress: { value: 0 },
  }), []);

  useLayoutEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    motion.current = preference;
    const redraw = () => invalidate();
    preference.addEventListener("change", redraw);
    return () => preference.removeEventListener("change", redraw);
  }, [invalidate]);

  useLayoutEffect(() => {
    startedAt.current = performance.now();
    invalidate();
  }, [entry, invalidate]);

  useFrame((_, delta) => {
    const reduce = motion.current?.matches ?? false;
    if (!reduce) uniforms.waterTime.value += Math.min(delta, .08);
    uniforms.diveProgress.value = entry === "lobby" ? 0
      : entry === "underwater" || reduce ? 1
      : Math.min(1, (performance.now() - startedAt.current) / WATER_ENTRY_MS);
    // R3F copies the uniforms prop into the material's own objects, so the
    // shared clock is the source and the pool's copies follow it.
    const live = material.current?.uniforms;
    if (!live) return;
    live.waterTime.value = uniforms.waterTime.value;
    live.diveProgress.value = uniforms.diveProgress.value;
  }, -2);

  return (
    <>
      <mesh renderOrder={-1000} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial ref={material} vertexShader={vertex} fragmentShader={entryWaterShader} uniforms={uniforms}
          transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {floaters !== undefined && entry !== "underwater" && <SurfaceIcons clock={uniforms} floaters={floaters} />}
    </>
  );
}

type BackdropProps = {
  look?: () => number;
  entry?: WaterEntry;
  /** Entry only: one person icon per player floats on the pool (null until the first snapshot). */
  floaters?: readonly Floater[] | null;
};

export function WaterBackdrop({ look, entry, floaters }: BackdropProps = {}) {
  return (
    <BettaVisual fallback={null}>
      <Canvas aria-hidden dpr={1} frameloop="demand" resize={{ offsetSize: true }}
        gl={{ antialias: false, alpha: !!entry }}
        style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" }}>
        {entry ? <EntryWater entry={entry} floaters={floaters} /> : <PaintedWater look={look} />}
        <WaterAnimation steered={!!look} />
      </Canvas>
    </BettaVisual>
  );
}
