"use client";

// Born stage on the phone: my betta, and a swipe up (or the button) sends it
// to the big screen. The fish flies off the top of the phone; on the screen it
// swims in from the bottom (app/screen/scenes/Born.tsx).

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
      <p className={styles.top}>{gone ? "큰 화면에서 내 베타를 찾아보세요." : "나의 베타가 태어났어요."}</p>

      <div className={`${styles.fish} ${gone ? styles.gone : ""}`} style={gone ? undefined : { transform: `translateY(${drag}px)` }}>
        <BettaPreview genome={genome} playerId={playerId} tag={tag} width={260} />
      </div>

      {!gone && (
        <button className={styles.button} onClick={release}>
          ↑ 위로 밀어 보내기
        </button>
      )}
    </main>
  );
}
