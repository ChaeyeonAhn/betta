"use client";

// Grid stage on the phone: a big pad. Each tap is one push against your own
// wall (server caps it). The bar is the whole room's push, which leaks, so
// the walls only break if people keep tapping together.

import { useState } from "react";
import type { SessionState } from "@/lib/protocol";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import styles from "./controls.module.css";

export function TapPad({ state, mine, onTap }: { state: SessionState; mine: number; onTap: () => void }) {
  const [pressed, setPressed] = useState(false);
  const share = state.effort.threshold ? Math.min(1, state.effort.total / state.effort.threshold) : 0;

  return (
    <main className={styles.root}>
      <WaterBackdrop />
      <p className={styles.top}>Tap together to open the partitions.</p>
      <button
        className={`${styles.pad} ${pressed ? styles.pressed : ""}`}
        onPointerDown={(e) => {
          e.preventDefault();
          setPressed(true);
          onTap();
          navigator.vibrate?.(8); // Android only; iOS Safari ignores it
        }}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
      >
        Tap
        <span className={styles.count}>{mine}</span>
      </button>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ transform: `scaleX(${share})` }} />
      </div>
    </main>
  );
}
