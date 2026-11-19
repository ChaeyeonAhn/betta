"use client";

// Born stage on the phone: my betta, and a swipe up (or the button) sends it
// to the big screen. The fish flies off the top of the phone; on the screen it
// swims in from the bottom (app/screen/scenes/Born.tsx).

import { useRef, useState } from "react";
import { BettaShape } from "@/app/_components/BettaShape";
import type { Genome } from "@/lib/protocol";
import styles from "./Release.module.css";

const SWIPE_PX = 70;

export function Release({ genome, tag, released, onRelease }: { genome: Genome; tag: string; released: boolean; onRelease: () => void }) {
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
      <p className={styles.top}>{gone ? "look up." : "your betta is born."}</p>

      <div className={`${styles.fish} ${gone ? styles.gone : ""}`} style={gone ? undefined : { transform: `translateY(${drag}px)` }}>
        <BettaShape genome={genome} size={260} label={tag} />
      </div>

      {!gone && (
        <button className={styles.button} onClick={release}>
          ↑ swipe up to release
        </button>
      )}
    </main>
  );
}
