"use client";

import dynamic from "next/dynamic";
import type { Genome } from "@/lib/protocol";
import styles from "./BettaPreview.module.css";

const PreviewScene = dynamic(() => import("./BettaPreviewScene").then((module) => module.BettaPreviewScene), {
  ssr: false,
});

export function BettaPreview({ genome, playerId, tag, width }: {
  genome: Genome;
  playerId: string;
  tag?: string;
  width: number;
}) {
  return (
    <figure className={styles.preview} style={{ width }}>
      <div className={styles.viewport}>
        <PreviewScene genome={genome} playerId={playerId} width={width} />
      </div>
      {tag && <figcaption className={styles.label}>{tag}</figcaption>}
    </figure>
  );
}
