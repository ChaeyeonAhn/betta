"use client";

// Born stage on the projection. Every visitor with a genome gets a slot; the
// slot stays an empty dot until they swipe their betta up from the phone,
// then the fish swims in from the bottom and settles. Same grid as the next
// stage (partitioned cubes), so each betta keeps its place.

import { BettaShape } from "@/app/_components/BettaShape";
import { shortTag } from "@/lib/playerId";
import type { PlayerView } from "@/lib/protocol";
import styles from "./Born.module.css";
import { GAP_X, GAP_Y, useFit } from "./useFit";

export function Born({ players }: { players: PlayerView[] }) {
  const born = players.filter((p) => p.genome);
  const released = born.filter((p) => p.released).length;
  const { columns, size, cellH } = useFit(born.length);

  return (
    <section className={styles.root}>
      <p className={styles.caption}>
        swipe up on your phone · {released} / {born.length}
      </p>
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${columns}, ${size}px)`, gridAutoRows: cellH, gap: `${GAP_Y}px ${GAP_X}px` }}
      >
        {born.map((p) =>
          p.released && p.genome ? (
            <div key={`${p.id}-in`} className={styles.swimIn}>
              <BettaShape genome={p.genome} size={size} label={shortTag(p.id)} />
            </div>
          ) : (
            <div key={`${p.id}-wait`} className={styles.slot}>
              <span className={styles.dot} />
              <span className={styles.tag}>{shortTag(p.id)}</span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
