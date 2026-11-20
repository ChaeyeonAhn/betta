"use client";

// Born stage on the projection. Every visitor with a genome gets a slot; the
// slot stays an empty dot until they swipe their betta up from the phone,
// then the fish swims in from the bottom and settles. Same grid as the next
// stage (partitioned cubes), so each betta keeps its place.

import { BettaShape } from "@/app/_components/BettaShape";
import { shortTag } from "@/lib/playerId";
import type { PlayerView } from "@/lib/protocol";
import styles from "./Born.module.css";
import { createGridLayout, projectedFishCenter } from "./gridLayout";

export function Born({ players }: { players: PlayerView[] }) {
  const born = players.filter((p) => p.genome);
  const released = born.filter((p) => p.released).length;
  const { slots, side } = createGridLayout(born.length);

  return (
    <section className={styles.root}>
      <p className={styles.caption}>
        swipe up on your phone · {released} / {born.length}
      </p>
      {born.map((p, i) => {
        const { x, y } = projectedFishCenter(slots[i], side);
        return (
          <div key={p.id} className={styles.position} style={{ left: x, top: y }}>
            {p.released && p.genome ? (
              <div className={styles.swimIn}>
                <BettaShape genome={p.genome} size={side * 0.78} label={shortTag(p.id)} />
              </div>
            ) : (
              <div className={styles.slot}>
                <span className={styles.dot} />
                <span className={styles.tag}>{shortTag(p.id)}</span>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
