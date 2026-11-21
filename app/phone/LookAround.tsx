"use client";

// First screen on the phone: no words, just the water. Turning the phone left
// or right pans across the same panorama the projection shows, and every few
// seconds a small phone icon rocks side to side as the only hint.

import { Hint } from "@/app/_components/Hint";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import styles from "./LookAround.module.css";
import { useDeviceLook } from "./useDeviceLook";

/** Degrees of turn from where the visitor started to the panorama's edge. */
const RANGE = 45;

export function LookAround() {
  const { look, handlers } = useDeviceLook({ clampYaw: RANGE });
  return (
    <main className={styles.root} {...handlers}>
      <WaterBackdrop look={() => look.current.yaw / RANGE} />
      <Hint kind="turn" />
    </main>
  );
}
