"use client";

// Grid stage, until this visitor's own cell breaks: the phone is the betta. The
// camera sits inside its cell, facing out of the grid toward the room, and the
// visitor turns the phone (or drags) to look around at the cells beside, above
// and behind, the projection's own grid. A tap pushes on the front glass, which
// cracks; once it breaks, the phone becomes the Helper.

import { useMemo } from "react";
import { Hint } from "@/app/_components/Hint";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { BettaVisual } from "@/app/screen/scenes/BettaCanvas";
import { createGridLayout } from "@/app/screen/scenes/gridLayout";
import { GridTank } from "@/app/screen/scenes/GridTank";
import { TAPS_PER_PLAYER, type PlayerView, type SessionState } from "@/lib/protocol";
import styles from "./Cell.module.css";
import { useDeviceLook } from "./useDeviceLook";
import { useTurnBubbles } from "./useTurnBubbles";

export function Cell({ state, me, slot, onPush }: {
  state: SessionState;
  me: PlayerView;
  slot: number;
  onPush: () => void;
}) {
  const layout = useMemo(() => createGridLayout(state.gridSize), [state.gridSize]);
  const bettas = state.players.flatMap((player) =>
    player.slot !== null && player.slot < layout.slots.length
      ? [{ id: player.id, genome: player.genome, slot: player.slot, effort: player.effort, broken: player.broken, helping: player.helping }]
      : []);
  const walls = state.stage === "grid";
  const { look, handlers, needsTap } = useDeviceLook({
    onTap: walls ? () => {
      onPush();
      navigator.vibrate?.(8); // Android only; iOS Safari ignores it
    } : undefined,
  });
  useTurnBubbles(look);
  // My own glass: it breaks at TAPS_PER_PLAYER, from my taps and anyone helping.
  const share = Math.min(1, me.effort / TAPS_PER_PLAYER);

  return (
    <main className={styles.root} {...handlers}>
      <BettaVisual fallback={<WaterBackdrop />}>
        <GridTank
          players={bettas}
          layout={layout}
          full
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
