"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useRef } from "react";
import { PerspectiveCamera, SRGBColorSpace, TextureLoader, type Sprite } from "three";
import { iconAspect, iconUrl } from "@/app/_components/surfaceIconImages";
import type { ReactionKind } from "@/lib/protocol";
import { STAGE_H } from "./gridLayout";

/** Pixels per second an icon rises from its fish toward the surface, above the frame. */
const RISE = 42;
/** Long enough for an icon from the bottom row to leave the top of the frame, even with the camera pulled back. */
export const REACTION_MS = Math.ceil((STAGE_H * 1.6 / RISE) * 1000);
/** Width of an icon, as a share of the cell. */
const ICON = 0.15;

const KINDS: readonly ReactionKind[] = ["heart", "happy", "mad", "message", "share", "serious", "sad"];

export function preloadGridReactions() {
  for (const kind of KINDS) useLoader.preload(TextureLoader, iconUrl(kind));
}
export type GridReactionEvent = {
  id: number;
  at: number;
  roundId: string;
  playerId: string;
  kind: ReactionKind;
};

/**
 * An icon leaves the fish and drifts up like a bubble, all the way out of the
 * top of the frame (the surface is up there). It is placed in its cell's
 * group, whose centre is `base` in the scene.
 */
export function GridReaction({ reaction, side, base }: {
  reaction: GridReactionEvent;
  side: number;
  base: readonly [number, number, number];
}) {
  return (
    <Suspense fallback={null}>
      <ReactionSprite reaction={reaction} side={side} base={base} />
    </Suspense>
  );
}

const halfTan = (fov: number) => Math.tan((fov * Math.PI) / 360);

function ReactionSprite({ reaction, side, base }: {
  reaction: GridReactionEvent;
  side: number;
  base: readonly [number, number, number];
}) {
  const sprite = useRef<Sprite>(null);
  const texture = useLoader(TextureLoader, iconUrl(reaction.kind));
  useLayoutEffect(() => {
    if (texture.colorSpace === SRGBColorSpace) return;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);

  useFrame(({ camera }) => {
    const object = sprite.current;
    if (!object) return;
    const seconds = (performance.now() - reaction.at) / 1000;
    const y = side * 0.14 + seconds * RISE;
    const width = side * ICON;
    const height = width / iconAspect(reaction.kind);
    // The frame's top edge at this depth, wherever the camera has moved to.
    const z = base[2] + side * 0.1;
    const top = camera instanceof PerspectiveCamera ? camera.position.y + (camera.position.z - z) * halfTan(camera.fov) : Infinity;
    object.visible = seconds >= 0 && base[1] + y - height < top;
    if (!object.visible) return;
    const pop = 0.7 + 0.3 * Math.sin(Math.min(seconds * 6, 1) * Math.PI * 0.5);
    object.scale.set(width * pop, height * pop, 1);
    // Each one sways on its own, like a bubble, as it goes up.
    const lane = (reaction.id % 3 - 1) * side * 0.08;
    object.position.set(lane + Math.sin(seconds * 1.6 + reaction.id * 1.7) * side * 0.07, y, side * 0.1);
    object.material.opacity = Math.min(1, seconds * 6);
  });

  return (
    <sprite ref={sprite} visible={false} renderOrder={12}>
      <spriteMaterial map={texture} transparent opacity={0} depthWrite={false} depthTest={false} toneMapped={false} />
    </sprite>
  );
}
