"use client";

// Born stage on the phone (or Mode A once the betta has grown): the finished
// betta in the middle of the screen; the camera pulls back to show it was in a
// cube in a grid all along (ReleaseScene.tsx), then an icon shows to swipe it
// up. It flies off the top of the phone and fades into its cell on the screen.

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { BettaShape } from "@/app/_components/BettaShape";
import { Hint } from "@/app/_components/Hint";
import { BettaVisual } from "@/app/screen/scenes/BettaCanvas";
import type { Genome } from "@/lib/protocol";
import styles from "./Release.module.css";

const ReleaseScene = dynamic(() => import("./ReleaseScene").then((module) => module.ReleaseScene), { ssr: false });

const SWIPE_PX = 70;
/** The fish's flight off the top (ReleaseScene LIFT_S), plus a beat. */
const FLY_MS = 900;
/** When the grid has been revealed and the swipe hint appears (ReleaseScene REVEAL_S). */
const HINT_MS = 3600;

export function Release({ genome, playerId, released, onRelease, onGone }: {
  genome: Genome;
  playerId: string;
  released: boolean;
  onRelease: () => void;
  /** The fish has flown off the top of the phone. */
  onGone?: () => void;
}) {
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [hint, setHint] = useState(false);
  const gone = released || leaving;

  useEffect(() => {
    const timer = setTimeout(() => setHint(true), HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  const release = () => {
    if (gone) return;
    setLeaving(true);
    onRelease();
    setTimeout(() => onGone?.(), FLY_MS);
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
      <BettaVisual fallback={<div className={styles.fallback}><BettaShape genome={genome} size={240} /></div>}>
        <ReleaseScene genome={genome} playerId={playerId} lift={-drag} gone={gone} />
      </BettaVisual>
      {hint && !gone && <Hint kind="swipe" size={64} className={styles.hint} />}
    </main>
  );
}
