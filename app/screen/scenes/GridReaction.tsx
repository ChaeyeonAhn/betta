"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useLayoutEffect, useRef } from "react";
import { SRGBColorSpace, TextureLoader, Vector3, type Sprite } from "three";
import { iconAspect, iconUrl } from "@/app/_components/surfaceIconImages";
import type { ReactionKind } from "@/lib/protocol";

export const REACTION_MS = 750;

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

export function GridReaction({ reaction, side }: { reaction: GridReactionEvent; side: number }) {
  return (
    <Suspense fallback={null}>
      <ReactionSprite reaction={reaction} side={side} />
    </Suspense>
  );
}

function ReactionSprite({ reaction, side }: { reaction: GridReactionEvent; side: number }) {
  const sprite = useRef<Sprite>(null);
  const scale = useRef(new Vector3());
  const texture = useLoader(TextureLoader, iconUrl(reaction.kind));
  useLayoutEffect(() => {
    if (texture.colorSpace === SRGBColorSpace) return;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);

  useFrame(() => {
    const object = sprite.current;
    if (!object?.parent) return;
    const progress = (performance.now() - reaction.at) / REACTION_MS;
    object.visible = progress < 1;
    if (!object.visible) return;

    // The sprite inherits the fish's motion, but keeps its world size as the fish grows.
    const inheritedScale = object.parent.getWorldScale(scale.current).x;
    const unit = side / inheritedScale;
    const pop = 0.65 + 0.45 * Math.sin(Math.min(progress * 5, 1) * Math.PI * 0.5);
    const width = unit * 0.25 * pop;
    object.scale.set(width, width / iconAspect(reaction.kind), 1);
    const lane = reaction.id % 3 - 1;
    object.position.set(unit * lane * 0.1, unit * (0.16 + progress * 0.22), unit * 0.07);
    object.material.opacity = Math.min(1, progress * 14) * Math.min(1, (1 - progress) * 3);
  });

  return (
    <sprite ref={sprite} visible={false} renderOrder={12}>
      <spriteMaterial map={texture} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}
