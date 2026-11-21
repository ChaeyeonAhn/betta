"use client";

import dynamic from "next/dynamic";
import type { Genome } from "@/lib/protocol";
import styles from "./BettaPreview.module.css";

const PreviewScene = dynamic(() => import("./BettaPreviewScene").then((module) => module.BettaPreviewScene), {
  ssr: false,
});

export function BettaPreview({ genome, playerId, tag, width, overscan = 1 }: {
  genome: Genome;
  playerId: string;
  tag?: string;
  width: number;
  overscan?: number;
}) {
  return (
    <figure className={styles.preview} style={{ width }}>
      <div className={`${styles.viewport} ${overscan > 1 ? styles.roomy : ""}`}>
        <div className={styles.render} style={{
          width: `${overscan * 100}%`, height: `${overscan * 100}%`,
          left: `${(1 - overscan) * 50}%`, top: `${(1 - overscan) * 50}%`,
        }}>
          <PreviewScene genome={genome} playerId={playerId} width={width} viewHeight={182 * overscan} />
        </div>
      </div>
      {tag && <figcaption className={styles.label}>{tag}</figcaption>}
    </figure>
  );
}
