"use client";

// The partitioned tank, from the first released betta until the walls break.
//
// Born (and Mode A's input): the tank starts empty. Each betta fades in with
// its cube in the random front cell the server gave it as its visitor releases
// it. Once everyone is in, placeholder bettas fade in with their cubes, front
// row first and then every row behind, and the full grid holds for a while.
//
// Grid: tapping on the phone pushes against your own wall: cracks spread over
// your cell. The bar at the bottom is the room's shared push; it leaks over
// time, so the walls only come down if enough people keep pushing together, or
// when the clock runs out (server/index.ts decides; this only draws).
//
// One component for both, so the WebGL tank stays mounted across the change.

import { useMemo } from "react";
import { BettaShape } from "@/app/_components/BettaShape";
import { Hint } from "@/app/_components/Hint";
import type { Genome, PlayerView, SessionState } from "@/lib/protocol";
import { BettaVisual } from "./BettaCanvas";
import styles from "./Grid.module.css";
import { createGridLayout } from "./gridLayout";
import { crackLines } from "./cracks";
import { GridTank } from "./GridTank";

const FILLER: Genome = { hue: 0, saturation: 0, finLength: 0.65, boundary: 0.5, sociability: 0.4 };

/** `leaving`: the walls just broke. Draw only the cubes and placeholders, over the open tank, to fade out. */
export function Grid({ state, leaving = false }: { state: SessionState; leaving?: boolean }) {
  const walls = state.stage === "grid";
  const layout = useMemo(() => createGridLayout(state.gridSize), [state.gridSize]);
  const { slots, side } = layout;
  const bettas = state.players.flatMap((player) =>
    player.genome && player.slot !== null && player.slot < slots.length ? [{ ...player, genome: player.genome, slot: player.slot }] : []);
  const share = state.effort.threshold ? Math.min(1, state.effort.total / state.effort.threshold) : 0;

  const { fillAt: fillStart } = state;

  return (
    <section className={styles.root}>
      <BettaVisual fallback={leaving ? null : slots.map(({ x, y }, i) => {
        const player = bettas.find((p) => p.slot === i);
        // Without WebGL, the placeholders simply appear once the fill starts.
        if (!player && !walls && fillStart === null) return null;
        return (
          <div
            key={i}
            className={`${styles.cell} ${styles.fallback} ${player ? "" : styles.filler}`}
            style={{ left: x - side / 2, top: y - side / 2, width: side, height: side }}
          >
            <BettaShape genome={player?.genome ?? FILLER} size={side * 0.78} />
          </div>
        );
      })}>
        <GridTank players={bettas} layout={layout} fillStart={fillStart} full={walls} arrive={!walls} leaving={leaving} />
      </BettaVisual>
      {bettas.map((player) => {
        const { x, y } = slots[player.slot];
        return (
          <div key={player.id} className={`${styles.cell} ${walls ? "" : styles.arriving}`} style={{ left: x - side / 2, top: y - side / 2, width: side, height: side }}>
            {walls && <Cracks player={player} side={side} />}
          </div>
        );
      })}

      {walls && !leaving && (
        <footer className={styles.footer}>
          <Hint kind="tap" size={64} className={styles.hint} />
          <div className={styles.bar}>
            <div className={styles.fill} style={{ width: `${share * 100}%` }} />
          </div>
        </footer>
      )}
    </section>
  );
}

/** Crack lines that grow with this player's taps (cracks.ts, shared with their phone). */
function Cracks({ player, side }: { player: PlayerView; side: number }) {
  const lines = crackLines(player.id, player.effort);
  if (!lines.length) return null;
  return (
    <svg className={styles.cracks} width={side} height={side} aria-hidden>
      {lines.map((line) => {
        const d = line.map(([x, y], k) => `${k ? "L" : "M"} ${(x * side).toFixed(1)} ${(y * side).toFixed(1)}`).join(" ");
        return <path key={d} d={d} fill="none" stroke="#e8e8e8" strokeWidth={1} strokeOpacity={0.7} />;
      })}
    </svg>
  );
}
