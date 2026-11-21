"use client";

// Grid stage: every betta alone in its own tank.
// Tapping on the phone pushes against your own wall: cracks spread over your
// cell. The bar at the bottom is the room's shared push; it leaks over time,
// so the walls only come down if enough people keep pushing together, or when
// the clock runs out (server/index.ts decides; this only draws).

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
  const bettas = state.players.flatMap((player) => player.genome ? [{ ...player, genome: player.genome }] : []);
  const count = bettas.length;
  const layout = useMemo(() => createGridLayout(count), [count]);
  const { slots, side } = layout;
  const now = useNow();
  const left = state.deadline ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : null;
  const share = state.effort.threshold ? Math.min(1, state.effort.total / state.effort.threshold) : 0;

  return (
    <section className={styles.root}>
      <BettaVisual fallback={slots.map(({ x, y }, i) => {
        const player = bettas[i];
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
        <GridTank players={bettas} layout={layout} />
      </BettaVisual>
      {bettas.map((player, i) => {
        const { x, y } = slots[i];
        return (
          <div key={player.id} className={styles.cell} style={{ left: x - side / 2, top: y - side / 2, width: side, height: side }}>
            <Cracks player={player} side={side} />
            <span className={styles.tag}>{shortTag(player.id)}</span>
          </div>
        );
      })}

      <footer className={styles.footer}>
        <p className={styles.caption}>휴대폰을 함께 두드려 칸막이를 열어주세요{left !== null ? ` · ${left}초` : ""}</p>
        <div className={styles.bar}>
          <div className={styles.fill} style={{ transform: `scaleX(${share})` }} />
        </div>
      </footer>
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
