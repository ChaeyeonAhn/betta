"use client";

// Born stage on the projection. Every visitor with a genome gets a slot; the
// slot stays an empty dot until they swipe their betta up from the phone,
// then the fish swims in from the bottom and settles. Same grid as the next
// stage (partitioned cubes), so each betta keeps its place.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { PaintedWater } from "@/app/_components/PaintedWater";
import { BettaModel } from "./BettaModel";
import { BettaCanvas, BettaVisual, stagePoint } from "./BettaCanvas";
import { BettaShape } from "@/app/_components/BettaShape";
import { shortTag } from "@/lib/playerId";
import type { Genome, PlayerView } from "@/lib/protocol";
import styles from "./Born.module.css";
import { createGridLayout, projectedFishCenter } from "./gridLayout";

export function Born({ players }: { players: PlayerView[] }) {
  const born = players.filter((p) => p.genome);
  const released = born.filter((p) => p.released).length;
  const { slots, side } = createGridLayout(born.length);

  return (
    <section className={styles.root}>
      <BettaVisual fallback={null}>
        <BettaCanvas background={null} scenery={<PaintedWater />}>
          {born.map((p, i) => {
            if (!p.released || !p.genome) return null;
            const { x, y } = projectedFishCenter(slots[i], side);
            return <Arrival key={p.id} id={p.id} genome={p.genome} x={x} y={y} size={side * .43} />;
          })}
        </BettaCanvas>
      </BettaVisual>
      <p className={styles.caption}>
        휴대폰에서 베타를 위로 밀어 보내세요 · {released} / {born.length}
      </p>
      {born.map((p, i) => {
        const { x, y } = projectedFishCenter(slots[i], side);
        return (
          <div key={p.id} className={styles.position} style={{ left: x, top: y }}>
            {p.released && p.genome ? (
              <div className={styles.swimIn}>
                <div className={styles.fallback}><BettaShape genome={p.genome} size={side * 0.78} /></div>
                <span className={styles.tag}>{shortTag(p.id)}</span>
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

function Arrival({ id, genome, x, y, size }: { id: string; genome: Genome; x: number; y: number; size: number }) {
  const model = useRef<Group>(null);
  const elapsed = useRef(0);
  useFrame((_, dt) => {
    if (!model.current) return;
    elapsed.current = Math.min(1, elapsed.current + dt / 1.6);
    const remaining = (1 - elapsed.current) ** 3;
    model.current.position.y = -420 * remaining;
    model.current.rotation.z = remaining * 1.12;
  });
  return (
    <group position={stagePoint(x, y)}>
      <group ref={model} position-y={-420}>
        <BettaModel genome={genome} seed={id} size={size} />
      </group>
    </group>
  );
}
