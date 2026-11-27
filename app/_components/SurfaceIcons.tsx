"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TextureLoader, type BufferGeometry, type Mesh, type ShaderMaterial, type Texture } from "three";
import { iconMaterial, type Uniform } from "./surfaceIconMaterial";
import { ICON_KINDS, iconAspect, iconGeometry, iconUrl, type SurfaceIconKind } from "./surfaceIconImages";
import { ENTRY_EYE, ENTRY_PITCH, ENTRY_RAY, WATER_SURFACE_Y, entryCamera } from "./waterEntry";

export type EntryClock = { waterTime: Uniform<number>; diveProgress: Uniform<number> };
/** One per joined player: a person icon on the water. */
export type Floater = { id: string; connected: boolean };

const AMBIENT: [SurfaceIconKind, number][] = [
  ["heart", 6], ["happy", 4], ["laugh", 4], ["share", 4], ["message", 4], ["mad", 3], ["sad", 3], ["serious", 2],
];
const AMBIENT_SIZE = [0.12, 0.16] as const;
/** The speech bubble is wide; it is sized by height, so it gets less of it. */
const MESSAGE_SCALE = 0.85;
const PERSON_SIZE = 0.18;
/** Lift of the icon's centre over the local wave, in icon heights. People ride higher so their shoulders show. */
const FLOAT = 0.32;
const PERSON_FLOAT = 0.44;
const HALF_SUNK = 0;
const START_DEPTH = -0.6;
const GONE_DEPTH = -0.5;
/** A player whose phone left keeps a half-sunk icon this long, in case it comes back. */
const GRACE_MS = 60_000;
/** The visible water, front to back (the pool's far wall is at z = -0.9). */
const Z_NEAR = 0.05;
const Z_FAR = -0.8;
/** Inside the frame's edge, a soft wall starts turning icons back this far before the hard one. */
const SOFT_EDGE = 0.18;

type Textures = Record<SurfaceIconKind, Texture>;

type Icon = {
  key: string;
  kind: SurfaceIconKind;
  /** Half its on-screen width, in world x. */
  half: number;
  /** Player id for person icons. */
  player?: string;
  connected: boolean;
  goneAt: number | null;
  x: number;
  z: number;
  vx: number;
  vz: number;
  seed: number;
  size: number;
  yaw: number;
  lift: number;
  liftV: number;
  material: ShaderMaterial;
  mesh?: Mesh | null;
};

/** Half the visible width of the water at depth z, from the lobby camera. */
function halfWidth(z: number) {
  const dy = WATER_SURFACE_Y - ENTRY_EYE[1];
  const dz = z - ENTRY_EYE[2];
  const depth = -(-Math.sin(ENTRY_PITCH) * dy + Math.cos(ENTRY_PITCH) * dz);
  return (ENTRY_RAY[0] / 2) * depth;
}

/** How far from the centre an icon's middle may go and still have all of it in the frame. */
const xLimit = (z: number, half: number) => Math.max(0, halfWidth(z) * 0.97 - half);

/** The best of a few random spots: the one farthest from the icons already there. */
function openSpot(others: readonly Icon[], half: number) {
  let best = { x: 0, z: 0 };
  let bestGap = -1;
  for (let i = 0; i < 12; i++) {
    const z = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);
    const spot = { x: (Math.random() * 2 - 1) * Math.max(0, xLimit(z, half) - SOFT_EDGE), z };
    let gap = Infinity;
    for (const other of others) gap = Math.min(gap, Math.hypot(spot.x - other.x, (spot.z - other.z) * 1.8));
    if (gap > bestGap) {
      best = spot;
      bestGap = gap;
    }
  }
  return best;
}

function makeIcon(
  kind: SurfaceIconKind, waterTime: Uniform<number>, textures: Textures, others: readonly Icon[], lift: number, player?: string,
): Icon {
  const size = player ? PERSON_SIZE
    : (AMBIENT_SIZE[0] + Math.random() * (AMBIENT_SIZE[1] - AMBIENT_SIZE[0])) * (kind === "message" ? MESSAGE_SCALE : 1);
  // ~0.68: the squeeze that undoes the pool's horizontal stretch.
  const half = size * iconAspect(kind) * 0.34;
  const { x, z } = openSpot(others, half);
  return {
    key: player ? `p:${player}` : `a:${Math.random().toString(36).slice(2)}`,
    kind,
    half,
    player,
    connected: true,
    goneAt: null,
    x,
    z,
    vx: 0,
    vz: 0,
    seed: Math.random() * 100,
    size,
    yaw: (Math.random() * 2 - 1) * 0.15,
    lift: lift * size,
    liftV: 0,
    material: iconMaterial(waterTime, textures[kind]),
  };
}

function targetLift(icon: Icon, now: number) {
  if (!icon.player) return FLOAT;
  if (icon.goneAt !== null) return now - icon.goneAt > GRACE_MS ? GONE_DEPTH / icon.size : HALF_SUNK;
  return icon.connected ? PERSON_FLOAT : HALF_SUNK;
}

export function SurfaceIcons({ clock, floaters }: { clock: EntryClock; floaters: readonly Floater[] | null }) {
  const invalidate = useThree((state) => state.invalidate);
  const geometries = useMemo(
    () => Object.fromEntries(ICON_KINDS.map((kind) => [kind, iconGeometry(kind)])) as Record<SurfaceIconKind, BufferGeometry>,
    [],
  );
  // Raw colour space: the pictures are drawn as they are, like the pool shader's colours.
  const textures = useMemo(() => {
    const loader = new TextureLoader();
    return Object.fromEntries(ICON_KINDS.map((kind) => [kind, loader.load(iconUrl(kind), () => invalidate())])) as Textures;
  }, [invalidate]);
  const [icons, setIcons] = useState<Icon[]>(() => {
    const made: Icon[] = [];
    for (const [kind, count] of AMBIENT) {
      for (let i = 0; i < count; i++) made.push(makeIcon(kind, clock.waterTime, textures, made, FLOAT));
    }
    return made;
  });
  const live = useRef(icons);
  live.current = icons;
  const baseline = useRef(false);
  const reduce = useRef(false);

  useLayoutEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduce.current = preference.matches;
      invalidate();
    };
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, [invalidate]);

  useEffect(() => () => {
    for (const geometry of Object.values(geometries)) geometry.dispose();
  }, [geometries]);
  useEffect(() => () => {
    for (const texture of Object.values(textures)) texture.dispose();
  }, [textures]);
  useEffect(() => () => {
    for (const icon of live.current) icon.material.dispose();
  }, []);

  // Players on the first snapshot are already floating; later ones rise from below.
  useEffect(() => {
    if (!floaters) return;
    const now = performance.now();
    const current = live.current;
    const byPlayer = new Map(current.filter((icon) => icon.player).map((icon) => [icon.player!, icon]));
    const listed = new Map(floaters.map((floater) => [floater.id, floater]));
    const added: Icon[] = [];
    for (const floater of floaters) {
      const icon = byPlayer.get(floater.id);
      if (icon) {
        icon.goneAt = null;
        icon.connected = floater.connected;
      } else {
        const fresh = makeIcon("person", clock.waterTime, textures, [...current, ...added], baseline.current ? START_DEPTH / PERSON_SIZE : PERSON_FLOAT, floater.id);
        fresh.connected = floater.connected;
        added.push(fresh);
      }
    }
    for (const [id, icon] of byPlayer) if (!listed.has(id) && icon.goneAt === null) icon.goneAt = now;
    baseline.current = true;
    if (added.length) setIcons([...current, ...added]);
    invalidate();
  }, [floaters, clock, textures, invalidate]);

  useFrame(({ camera, size }, delta) => {
    const dt = Math.min(delta, 0.08);
    const now = performance.now();
    const t = clock.waterTime.value;
    const progress = clock.diveProgress.value;
    const still = reduce.current;

    // Follow the shader's camera exactly; R3F would otherwise rewrite the projection on resize.
    const { eye, pitch } = entryCamera(progress);
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.rotation.set(pitch, 0, 0);
    camera.updateMatrixWorld();
    const near = 0.01;
    const hx = (ENTRY_RAY[0] / 2) * near;
    const hy = (ENTRY_RAY[1] / 2) * near;
    camera.projectionMatrix.makePerspective(-hx, hx, hy, -hy, near, 50);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const stretch = (ENTRY_RAY[0] / ENTRY_RAY[1]) / (size.width / Math.max(1, size.height));

    // The icons stay on the surface through the dive; the camera going down carries them up out of the frame.

    const list = live.current;
    let removed = false;
    for (const icon of list) {
      const target = targetLift(icon, now) * icon.size;
      if (still) {
        icon.lift = target;
        icon.liftV = 0;
      } else {
        // A slightly underdamped spring: a rising icon overshoots a little, then settles.
        icon.liftV += (7 * (target - icon.lift) - 3.6 * icon.liftV) * dt;
        icon.lift += icon.liftV * dt;
      }
      if (icon.goneAt !== null && target < 0 && icon.lift < GONE_DEPTH * 0.95) removed = true;
    }

    if (!still) {
      // Each one wanders on its own slowly turning current, keeps apart, and stays on the visible water.
      for (const icon of list) {
        icon.vx += (Math.sin(t * 0.21 + icon.seed * 7.1) + 0.5 * Math.sin(t * 0.53 + icon.seed * 2.3)) * 0.04 * dt;
        icon.vz += (Math.cos(t * 0.17 + icon.seed * 3.7) + 0.5 * Math.cos(t * 0.47 + icon.seed * 5.9)) * 0.02 * dt;
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const reach = a.half + b.half + 0.03;
          // z is foreshortened about 2x on screen, so it counts double.
          const dx = b.x - a.x;
          const dz = (b.z - a.z) * 1.8;
          const d = Math.hypot(dx, dz);
          if (d >= reach || d === 0) continue;
          const f = ((reach - d) / reach) * 0.05 * dt;
          a.vx -= (dx / d) * f;
          a.vz -= (dz / d) * f;
          b.vx += (dx / d) * f;
          b.vz += (dz / d) * f;
        }
      }
      for (const icon of list) {
        // A soft wall inside the frame turns them back; a hard one never lets any part leave it.
        const limit = xLimit(icon.z, icon.half);
        const soft = Math.max(0, limit - SOFT_EDGE);
        if (icon.x > soft) icon.vx -= (icon.x - soft) * 2.5 * dt;
        if (icon.x < -soft) icon.vx -= (icon.x + soft) * 2.5 * dt;
        const near = Z_NEAR - SOFT_EDGE * 0.3;
        const far = Z_FAR + SOFT_EDGE * 0.3;
        if (icon.z > near) icon.vz -= (icon.z - near) * 2.5 * dt;
        if (icon.z < far) icon.vz -= (icon.z - far) * 2.5 * dt;
        const damping = Math.exp(-dt * 0.55);
        icon.vx *= damping;
        icon.vz *= damping;
        icon.x += icon.vx * dt;
        icon.z += icon.vz * dt;
        if (Math.abs(icon.x) > limit) {
          icon.x = Math.sign(icon.x) * limit;
          icon.vx = -icon.vx * 0.4;
        }
        if (icon.z > Z_NEAR || icon.z < Z_FAR) {
          icon.z = Math.min(Z_NEAR, Math.max(Z_FAR, icon.z));
          icon.vz = -icon.vz * 0.4;
        }
      }
    }

    for (const icon of list) {
      const u = icon.material.uniforms;
      u.anchor.value.set(icon.x, icon.z);
      u.lift.value = icon.lift;
      u.size.value = icon.size;
      // Rock and turn a little on top of what the waves do.
      u.yaw.value = icon.yaw + (still ? 0 : Math.sin(t * 0.27 + icon.seed * 1.3) * 0.15);
      u.wobble.value = still ? 0 : Math.sin(t * 0.9 + icon.seed) * 0.09 + Math.sin(t * 0.37 + icon.seed * 2.1) * 0.05;
      u.stretch.value = stretch;
      // The shader places the panel; the mesh position only sorts the transparent panels by depth.
      icon.mesh?.position.set(icon.x, WATER_SURFACE_Y + icon.lift, icon.z);
    }

    if (removed) {
      const keep = list.filter((icon) => {
        const gone = icon.goneAt !== null && targetLift(icon, now) < 0 && icon.lift < GONE_DEPTH * 0.95;
        if (gone) icon.material.dispose();
        return !gone;
      });
      live.current = keep;
      setIcons(keep);
    }
  }, -1);

  return (
    <>
      {icons.map((icon) => (
        <mesh key={icon.key} ref={(mesh) => { icon.mesh = mesh; }} geometry={geometries[icon.kind]}
          material={icon.material} frustumCulled={false} />
      ))}
    </>
  );
}
