"use client";

// Renders the visitor's betta once into a hidden canvas and hands back a
// transparent PNG for the card: a still, level side view. Loaded with ssr: false (WebGL).

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { BettaCanvas } from "@/app/screen/scenes/BettaCanvas";
import { BettaModel } from "@/app/screen/scenes/BettaModel";
import type { Genome } from "@/lib/protocol";
import styles from "./BettaCard.module.css";
import { CARD_FISH_SIZE } from "./composeCard";

/** Frames to let the fins settle into a pose before reading the picture. */
const SETTLE_FRAMES = 30;

export function CardSnapshot({ genome, playerId, onShot }: {
  genome: Genome;
  playerId: string;
  onShot: (image: Blob) => void;
}) {
  return (
    <div className={styles.snapshot} aria-hidden>
      <BettaCanvas viewHeight={182} dpr={1.5} background={null} gl={{ preserveDrawingBuffer: true, alpha: true }}>
        <BettaModel genome={genome} seed={playerId} size={CARD_FISH_SIZE} calm="still" />
        <Shot onShot={onShot} />
      </BettaCanvas>
    </div>
  );
}

// Mounted inside the canvas's Suspense, so it only counts frames once the fish is drawn.
function Shot({ onShot }: { onShot: (image: Blob) => void }) {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  const taken = useRef(false);
  useFrame(() => {
    if (taken.current || ++frames.current < SETTLE_FRAMES) return;
    taken.current = true;
    gl.domElement.toBlob((blob) => blob && onShot(blob), "image/png");
  });
  return null;
}
