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

import { useEffect, useMemo, useState } from "react";
import { BettaShape } from "@/app/_components/BettaShape";
import { shortTag } from "@/lib/playerId";
import { TAPS_PER_PLAYER, type Genome, type PlayerView, type SessionState } from "@/lib/protocol";
import { BettaVisual } from "./BettaCanvas";
import styles from "./Grid.module.css";
import { createGridLayout } from "./gridLayout";
import { GridTank } from "./GridTank";

const MAX_CRACKS = 6;
const FILLER: Genome = { hue: 0, saturation: 0, finLength: 0.65, boundary: 0.5, sociability: 0.4 };

export function Grid({ state }: { state: SessionState }) {
  const walls = state.stage === "grid";
  const layout = useMemo(() => createGridLayout(state.gridSize), [state.gridSize]);
  const { slots, side } = layout;
  const bettas = state.players.flatMap((player) =>
    player.genome && player.slot !== null && player.slot < slots.length ? [{ ...player, genome: player.genome, slot: player.slot }] : []);
  const now = useNow();
  const left = state.deadline ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : null;
  const share = state.effort.threshold ? Math.min(1, state.effort.total / state.effort.threshold) : 0;

  const { fillAt: fillStart } = state;

  const round = state.players.filter((p) => p.connected && (p.phase === "input" || p.phase === "caged")).length;
  const caption = walls || fillStart !== null
    ? null
    : state.stage === "input"
      ? `Your bettas are growing on your phones · ${bettas.length} / ${round}`
      : `Swipe your betta up from your phone · ${bettas.length} / ${round}`;

  return (
    <section className={styles.root}>
      <BettaVisual fallback={slots.map(({ x, y }, i) => {
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
        <GridTank players={bettas} layout={layout} fillStart={fillStart} full={walls} arrive={!walls} />
      </BettaVisual>
      {bettas.map((player) => {
        const { x, y } = slots[player.slot];
        return (
          <div key={player.id} className={`${styles.cell} ${walls ? "" : styles.arriving}`} style={{ left: x - side / 2, top: y - side / 2, width: side, height: side }}>
            {walls && <Cracks player={player} side={side} />}
            <span className={styles.tag}>{shortTag(player.id)}</span>
          </div>
        );
      })}

      {walls ? (
        <footer className={styles.footer}>
          <p className={styles.caption}>Tap your phones together to open the partitions{left !== null ? ` · ${left}s` : ""}</p>
          <div className={styles.bar}>
            <div className={styles.fill} style={{ transform: `scaleX(${share})` }} />
          </div>
        </footer>
      ) : caption && (
        <footer className={styles.footer}>
          <p className={styles.caption}>{caption}</p>
        </footer>
      )}
    </section>
  );
}

/** Crack lines that grow with this player's taps. Shapes are seeded by id so they don't jump. */
function Cracks({ player, side }: { player: PlayerView; side: number }) {
  const count = Math.min(MAX_CRACKS, Math.floor(player.effort / (TAPS_PER_PLAYER / MAX_CRACKS)));
  if (!count) return null;
  const rand = seeded(player.id);
  const lines: string[] = [];
  for (let k = 0; k < count; k++) {
    // Start on a random edge, zig-zag inwards.
    const edge = Math.floor(rand() * 4);
    let x = edge === 0 ? 0 : edge === 1 ? side : rand() * side;
    let y = edge === 2 ? 0 : edge === 3 ? side : rand() * side;
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    for (let s = 0; s < 4; s++) {
      x += (side / 2 - x) * 0.3 + (rand() - 0.5) * side * 0.18;
      y += (side / 2 - y) * 0.3 + (rand() - 0.5) * side * 0.18;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    lines.push(d);
  }
  return (
    <svg className={styles.cracks} width={side} height={side} aria-hidden>
      {lines.map((d) => (
        <path key={d} d={d} fill="none" stroke="#e8e8e8" strokeWidth={1} strokeOpacity={0.7} />
      ))}
    </svg>
  );
}

function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return now;
}
