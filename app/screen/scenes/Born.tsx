"use client";

// Born stage on the projection. Every visitor with a genome gets a slot; the
// slot stays an empty dot until they swipe their betta up from the phone,
// then the fish swims in from the bottom and settles. Slots are laid out as a
// grid already, so the next stage (partitioned cubes) can reuse the layout.

import { useEffect, useState } from "react";
import { BettaShape } from "@/app/_components/BettaShape";
import { shortTag } from "@/lib/playerId";
import type { PlayerView } from "@/lib/protocol";
import styles from "./Born.module.css";

export function Born({ players }: { players: PlayerView[] }) {
  const born = players.filter((p) => p.genome);
  const released = born.filter((p) => p.released).length;
  const columns = Math.max(1, Math.ceil(Math.sqrt(born.length * (16 / 9))));
  const rows = Math.max(1, Math.ceil(born.length / columns));
  // Fit the grid in the window: width per column, and height per row (fish is 0.7 tall + label).
  const [view, setView] = useState({ w: 1600, h: 900 });
  useEffect(() => {
    const update = () => setView({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const size = Math.floor(Math.min(240, (view.w * 0.9) / columns - 40, (view.h * 0.7) / rows / 0.8 - 24));

  return (
    <section className={styles.root}>
      <p className={styles.caption}>
        swipe up on your phone · {released} / {born.length}
      </p>
      <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${columns}, ${size}px)` }}>
        {born.map((p) =>
          p.released && p.genome ? (
            <div key={`${p.id}-in`} className={styles.swimIn}>
              <BettaShape genome={p.genome} size={size} label={shortTag(p.id)} />
            </div>
          ) : (
            <div key={`${p.id}-wait`} className={styles.slot} style={{ height: size * 0.7 + 16 }}>
              <span className={styles.dot} />
              <span className={styles.tag}>{shortTag(p.id)}</span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
