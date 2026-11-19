"use client";

// Grid stage: every betta alone in its own cube (drawn as a wireframe box).
// Tapping on the phone pushes against your own wall: cracks spread over your
// cell. The bar at the bottom is the room's shared push; it leaks over time,
// so the walls only come down if enough people keep pushing together, or when
// the clock runs out (server/index.ts decides; this only draws).

import { useEffect, useState } from "react";
import { BettaShape } from "@/app/_components/BettaShape";
import { shortTag } from "@/lib/playerId";
import { TAPS_PER_PLAYER, type PlayerView, type SessionState } from "@/lib/protocol";
import styles from "./Grid.module.css";
import { cellCenter, useFit } from "./useFit";

const MAX_CRACKS = 6;

export function Grid({ state }: { state: SessionState }) {
  const bettas = state.players.filter((p) => p.genome);
  const fit = useFit(bettas.length);
  const { size, cellH } = fit;
  const now = useNow();
  const left = state.deadline ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : null;
  const share = state.effort.threshold ? Math.min(1, state.effort.total / state.effort.threshold) : 0;

  return (
    <section className={styles.root}>
      {bettas.map((p, i) => {
        const c = cellCenter(i, fit);
        const w = size + 24;
        const h = cellH + 8;
        return (
          <div key={p.id} className={styles.cell} style={{ left: c.x - w / 2, top: c.y - h / 2, width: w, height: h }}>
            <BettaShape genome={p.genome!} size={size} label={shortTag(p.id)} />
            <Cracks player={p} w={w} h={h} />
          </div>
        );
      })}

      <footer className={styles.footer}>
        <p className={styles.caption}>tap your phone to push the walls · together{left !== null ? ` · ${left}s` : ""}</p>
        <div className={styles.bar}>
          <div className={styles.fill} style={{ transform: `scaleX(${share})` }} />
        </div>
      </footer>
    </section>
  );
}

/** Crack lines that grow with this player's taps. Shapes are seeded by id so they don't jump. */
function Cracks({ player, w, h }: { player: PlayerView; w: number; h: number }) {
  const count = Math.min(MAX_CRACKS, Math.floor(player.effort / (TAPS_PER_PLAYER / MAX_CRACKS)));
  if (!count) return null;
  const rand = seeded(player.id);
  const lines: string[] = [];
  for (let k = 0; k < MAX_CRACKS; k++) {
    // Start on a random edge, zig-zag inwards.
    const edge = Math.floor(rand() * 4);
    let x = edge === 0 ? 0 : edge === 1 ? w : rand() * w;
    let y = edge === 2 ? 0 : edge === 3 ? h : rand() * h;
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    for (let s = 0; s < 4; s++) {
      x += (w / 2 - x) * 0.3 + (rand() - 0.5) * 30;
      y += (h / 2 - y) * 0.3 + (rand() - 0.5) * 30;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    lines.push(d);
  }
  return (
    <svg className={styles.cracks} width={w} height={h} aria-hidden>
      {lines.slice(0, count).map((d) => (
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
