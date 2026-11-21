"use client";

// From release until the walls break, the phone is the betta: the camera sits
// inside its cell, facing out of the grid toward the room, and the visitor
// turns the phone (or drags) to look around at the cells beside, above and
// behind. The grid is the projection's own (same layout, slots and fill clock).
// During the grid stage a tap pushes on the front glass, which cracks.

import { useMemo } from "react";
import { Hint } from "@/app/_components/Hint";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { BettaVisual } from "@/app/screen/scenes/BettaCanvas";
import { createGridLayout } from "@/app/screen/scenes/gridLayout";
import { GridTank } from "@/app/screen/scenes/GridTank";
import type { PlayerView, SessionState } from "@/lib/protocol";
import styles from "./Cell.module.css";
import { useDeviceLook } from "./useDeviceLook";

export function Cell({ state, me, slot, onPush }: {
  state: SessionState;
  me: PlayerView;
  slot: number;
  onPush: () => void;
}) {
  const layout = useMemo(() => createGridLayout(state.gridSize), [state.gridSize]);
  const bettas = state.players.flatMap((player) =>
    player.genome && player.slot !== null && player.slot < layout.slots.length
      ? [{ id: player.id, genome: player.genome, slot: player.slot }]
      : []);
  const walls = state.stage === "grid";
  const { look, handlers, needsTap } = useDeviceLook({
    onTap: walls ? () => {
      onPush();
      navigator.vibrate?.(8); // Android only; iOS Safari ignores it
    } : undefined,
  });
  const share = state.effort.threshold ? Math.min(1, state.effort.total / state.effort.threshold) : 0;

  return (
    <main className={styles.root} {...handlers}>
      <BettaVisual fallback={<WaterBackdrop />}>
        <GridTank
          players={bettas}
          layout={layout}
          fillStart={state.fillAt}
          full={walls}
          arrive
          pov={{ slot, id: me.id, effort: me.effort, look }}
        />
      </BettaVisual>
      <Hint kind={walls || needsTap ? "tap" : "turn"} size={64} className={styles.hint} />
      {walls && (
        <div className={styles.gauge}>
          <div className={styles.fill} style={{ width: `${share * 100}%` }} />
        </div>
      )}
    </main>
  );
}
