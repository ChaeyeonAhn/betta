"use client";

// Grid stage, once this visitor's cell has broken (or for a late visitor with
// no cell): their betta is out, and they help the others break theirs. The
// phone looks at one closed cell's glass from outside; a tap cracks it.
// Tilting the phone hard to a side (or swiping) moves to the nearest closed
// cell that way; the server moves them on by itself when that cell breaks.

import { useEffect, useMemo, useRef, useState } from "react";
import { Hint } from "@/app/_components/Hint";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { BettaVisual } from "@/app/screen/scenes/BettaCanvas";
import { createGridLayout } from "@/app/screen/scenes/gridLayout";
import { GridTank } from "@/app/screen/scenes/GridTank";
import { TAPS_PER_PLAYER, type PlayerView, type SessionState } from "@/lib/protocol";
import styles from "./Cell.module.css";
import helper from "./Helper.module.css";
import { useTilt } from "./useTilt";

/** Tilt (of the full range) that moves to the next cell, and how level it has to come back before the next move. */
const MOVE_AT = 0.6;
const REARM_AT = 0.3;
const SWIPE = 48;
const TAP_SLOP = 8;
type Direction = "up" | "right" | "down" | "left";
const STEP: Record<Direction, [number, number]> = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

export function Helper({ state, me, onPush, onHelp }: {
  state: SessionState;
  me: PlayerView;
  onPush: () => void;
  onHelp: (slot: number) => void;
}) {
  const layout = useMemo(() => createGridLayout(state.gridSize), [state.gridSize]);
  const bettas = state.players.flatMap((player) =>
    player.slot !== null && player.slot < layout.slots.length
      ? [{ id: player.id, genome: player.genome, slot: player.slot, effort: player.effort, broken: player.broken, helping: player.helping }]
      : []);
  const closed = bettas.filter((player) => player.genome && !player.broken);
  const closedKey = closed.map((player) => player.slot).join(",");

  // The cell picked here shows at once; the server's choice wins when that cell breaks.
  const [picked, setPicked] = useState<number | null>(me.helping);
  useEffect(() => setPicked(me.helping), [me.helping]);
  const target = closed.some((player) => player.slot === picked) ? picked : me.helping;
  const targetCell = closed.find((player) => player.slot === target);

  /** The nearest closed cell in a direction from the one in view. */
  const neighbour = (direction: Direction) => {
    if (target === null) return null;
    const from = layout.slots[target];
    const [sx, sy] = STEP[direction];
    let best: number | null = null;
    let bestDistance = Infinity;
    for (const { slot } of closed) {
      if (slot === target) continue;
      const dx = layout.slots[slot].x - from.x;
      const dy = layout.slots[slot].y - from.y;
      const distance = Math.hypot(dx, dy);
      if ((dx * sx + dy * sy) / distance < 0.5 || distance >= bestDistance) continue;
      best = slot;
      bestDistance = distance;
    }
    return best;
  };
  const move = (direction: Direction) => {
    const next = neighbour(direction);
    if (next === null) return;
    setPicked(next);
    onHelp(next);
    navigator.vibrate?.(12);
  };
  const moveRef = useRef(move);
  moveRef.current = move;

  const { tilt, active } = useTilt();
  useEffect(() => {
    if (!active) return;
    let armed = true;
    const timer = setInterval(() => {
      const { x, y } = tilt.current;
      if (!armed) {
        armed = Math.abs(x) < REARM_AT && Math.abs(y) < REARM_AT;
        return;
      }
      if (Math.max(Math.abs(x), Math.abs(y)) < MOVE_AT) return;
      armed = false;
      moveRef.current(Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up"));
    }, 60);
    return () => clearInterval(timer);
  }, [active, tilt]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const share = targetCell ? Math.min(1, targetCell.effort / TAPS_PER_PLAYER) : 0;
  const ways = closedKey && target !== null
    ? (Object.keys(STEP) as Direction[]).filter((direction) => neighbour(direction) !== null)
    : [];

  return (
    <main
      className={styles.root}
      onPointerDown={(e) => { touch.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) < TAP_SLOP) {
          onPush();
          navigator.vibrate?.(8);
        } else if (Math.max(Math.abs(dx), Math.abs(dy)) > SWIPE) {
          // Swiping drags the grid, so the cell on the other side comes into view.
          move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "left" : "right") : (dy > 0 ? "up" : "down"));
        }
      }}
      onPointerCancel={() => { touch.current = null; }}
    >
      <BettaVisual fallback={<WaterBackdrop />}>
        {target !== null && <GridTank players={bettas} layout={layout} full outside={{ id: me.id, slot: target }} />}
      </BettaVisual>
      {ways.map((direction) => <div key={direction} className={helper.way} data-side={direction} />)}
      <Hint kind="tap" size={64} className={styles.hint} />
      <div className={styles.gauge}>
        <div className={styles.fill} style={{ width: `${share * 100}%` }} />
      </div>
    </main>
  );
}
