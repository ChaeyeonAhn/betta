"use client";

// Born stage on the phone: my betta, and a swipe up (or the button) sends it
// to the big screen. The fish flies off the top of the phone; on the screen it
// swims up into its grid cell (app/screen/scenes/Grid.tsx).

import { useRef, useState } from "react";
import type { Genome } from "@/lib/protocol";
import { BettaPreview } from "./BettaPreview";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import styles from "./Release.module.css";

const SWIPE_PX = 70;

export function Release({ genome, playerId, tag, released, onRelease }: {
  genome: Genome;
  playerId: string;
  tag: string;
  released: boolean;
  onRelease: () => void;
}) {
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const gone = released || leaving;

  const release = () => {
    if (gone) return;
    setLeaving(true);
    onRelease();
  };

  return (
    <main
      className={styles.root}
      onPointerDown={(e) => (startY.current = e.clientY)}
      onPointerMove={(e) => {
        if (startY.current === null || gone) return;
        setDrag(Math.min(0, e.clientY - startY.current));
      }}
      onPointerUp={() => {
        if (drag < -SWIPE_PX) release();
        startY.current = null;
        setDrag(0);
      }}
      onPointerCancel={() => {
        startY.current = null;
        setDrag(0);
      }}
    >
      <WaterBackdrop />
      <p className={styles.top}>{gone ? "Find your betta on the big screen." : "Your betta is born."}</p>

      <div className={`${styles.fish} ${gone ? styles.gone : ""}`} style={gone ? undefined : { transform: `translateY(${drag}px)` }}>
        <BettaPreview genome={genome} playerId={playerId} tag={tag} width={260} />
      </div>

      {!gone && (
        <button className={styles.button} onClick={release}>
          ↑ Swipe up to release
        </button>
      )}
    </main>
  );
}
