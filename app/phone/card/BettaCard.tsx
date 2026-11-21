"use client";

// Open stage, after the visitor's OPEN_MS with the joystick: their betta card.
// The betta keeps swimming on the projection; the card is what they take home.
// Save downloads the PNG (iOS goes through the share sheet, which has "Save Image").

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Genome } from "@/lib/protocol";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { composeCard } from "./composeCard";
import styles from "./BettaCard.module.css";

const CardSnapshot = dynamic(() => import("./CardSnapshot").then((module) => module.CardSnapshot), { ssr: false });

const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function BettaCard({ genome, playerId, tag }: { genome: Genome; playerId: string; tag: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const shoot = async (fish: Blob) => {
    try {
      const card = await composeCard({ fish, genome, tag, date: new Date() });
      setFile(new File([card], `betta-${tag.replace("#", "")}.png`, { type: "image/png" }));
      setUrl(URL.createObjectURL(card));
    } catch {
      setFailed(true);
    }
  };

  const canShare = file !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "My betta", text: `My betta ${tag}, still swimming in the shared tank.` });
    } catch {
      // Closing the share sheet rejects; nothing to do.
    }
  };

  const save = () => {
    if (!file || !url) return;
    if (canShare && isIOS()) {
      void share();
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
  };

  return (
    <main className={styles.root}>
      <WaterBackdrop />
      <p className={styles.top}>Your betta stays in the tank.</p>
      <div className={styles.frame}>
        {url
          ? <img className={styles.card} src={url} alt={`Betta card for ${tag}`} />
          : <p className={styles.waiting}>{failed ? "The card couldn't be drawn." : "Drawing your card…"}</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} disabled={!url} onClick={save}>Save</button>
        {canShare && <button type="button" className={styles.button} onClick={share}>Share</button>}
      </div>
      {!url && !failed && <CardSnapshot genome={genome} playerId={playerId} onShot={shoot} />}
    </main>
  );
}
