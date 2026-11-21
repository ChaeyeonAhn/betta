"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { type Group, MeshStandardMaterial, SRGBColorSpace, TextureLoader } from "three";
import type { Genome } from "@/lib/protocol";
import { createBettaMaterial } from "./bettaMaterial";
import { BODY_REST_PITCH, body, eyeball, fins, pairedFins } from "./bettaMesh";

const ATLAS = "/betta-uv.webp";
const eye = new MeshStandardMaterial({ color: "#110c25", roughness: 0.22 });
const eyeRim = new MeshStandardMaterial({ color: "#9d82dc", roughness: 0.38 });
const SWIMS = [
  { travel: 0.16, drift: 0.49, roll: 0.05, turn: 0.13, pulse: 1.0 }, // hover
  { travel: 0.36, drift: 0.70, roll: 0.11, turn: 0.32, pulse: 0.76 }, // slow glide
  { travel: 0.27, drift: 0.85, roll: 0.15, turn: 0.23, pulse: 1.32 }, // short pulses
];

export function useBettaAtlas() {
  const atlas = useLoader(TextureLoader, ATLAS);
  useLayoutEffect(() => {
    if (atlas.colorSpace === SRGBColorSpace) return;
    atlas.colorSpace = SRGBColorSpace;
    atlas.needsUpdate = true;
  }, [atlas]);
  return atlas;
}

export function BettaModel({ genome, seed, size, followHeading = false }: {
  genome: Genome;
  seed: string;
  size: number;
  followHeading?: boolean;
}) {
  const fish = useRef<Group>(null);
  const atlas = useBettaAtlas();
  const id = useMemo(() => {
    let hash = 2166136261;
    for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  }, [seed]);
  const { hue, saturation, finLength, boundary, sociability, markings, reactivity = 0.5, glide = 0.5 } = genome;
  const pattern = markings === undefined ? id % 3 : (id + Math.min(2, Math.floor(markings * 3))) % 3;
  const phase = (id % 101) / 16;
  const swim = SWIMS[(id >>> 8) % SWIMS.length];
  const [skin, membrane] = useMemo(() => {
    const style = { hue, saturation, finLength, pattern, markings, seed: id / 0xffffffff, filler: false };
    return [createBettaMaterial(atlas, style, false), createBettaMaterial(atlas, style, true)];
  }, [atlas, hue, saturation, finLength, pattern, markings, id]);

  useEffect(() => () => {
    skin.material.dispose();
    membrane.material.dispose();
  }, [skin, membrane]);

  useFrame(({ clock }) => {
    if (!fish.current) return;
    const time = clock.elapsedTime;
    const drift = time * swim.drift * (0.65 + glide * 0.7) + phase;
    const stroke = time * (2.4 + sociability * 4.2) * swim.pulse * (0.68 + reactivity * 0.64) + phase;
    const room = (1 - boundary * 0.5) * (0.70 + glide * 0.6);
    const thrust = Math.sin(stroke) * 0.045 * swim.pulse;
    membrane.time.value = stroke;
    const roll = Math.sin(stroke * 0.39) * swim.roll;
    if (followHeading) {
      // The parent supplies the heading. Keep the body axis neutral while the fins swim.
      fish.current.rotation.set(roll, 0, -BODY_REST_PITCH);
      return;
    }

    fish.current.position.set(
      0.24 + Math.sin(drift) * swim.travel * room + thrust,
      Math.sin(drift * 1.17) * 0.12 * room,
      Math.sin(drift * 0.94) * 0.24,
    );
    fish.current.rotation.set(
      roll,
      Math.sin(drift * 1.07) * swim.turn,
      0.23 + Math.sin(drift * 1.11) * 0.10 + thrust,
    );
  });

  return (
    <group scale={size}>
      <group ref={fish} position-x={0.24}>
        <mesh geometry={body} material={skin.material} />
        {fins.map((geometry, i) => <mesh key={geometry.id} geometry={geometry} material={membrane.material} renderOrder={i + 1} />)}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={eyeball} material={eyeRim}
              position={[0.352, 0.072, side * 0.035]} scale={[0.031, 0.031, 0.017]} />
            <mesh geometry={eyeball} material={eye}
              position={[0.356, 0.074, side * 0.046]} scale={[0.022, 0.022, 0.011]} />
            {pairedFins.map((geometry, i) => (
              <mesh key={geometry.id} geometry={geometry} material={membrane.material} renderOrder={i + 4}
                position={[0, 0, side * (0.035 + i * 0.025)]} rotation={[side * -0.16, 0, 0]} />
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}
