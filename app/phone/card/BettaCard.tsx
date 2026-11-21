"use client";

// Open stage, after the visitor's OPEN_MS with the console: their betta card.
// On the phone the betta keeps swimming in it; Save / Share export a PNG with
// a still side view (composeCard.ts, same layout). The betta also stays in the
// tank on the projection. Save downloads the PNG (iOS goes through the share
// sheet, which has "Save Image").

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Genome } from "@/lib/protocol";
import { CARD, CARD_FONT, CARD_FOOTER, cardDate, composeCard } from "./composeCard";
import { traits } from "./traits";
import styles from "./BettaCard.module.css";

const CardSnapshot = dynamic(() => import("./CardSnapshot").then((module) => module.CardSnapshot), { ssr: false });
const CardFish = dynamic(() => import("./CardFish").then((module) => module.CardFish), { ssr: false });

const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Card pixels → CSS, relative to the card's width. */
const at = (props: Record<string, number>) =>
  Object.fromEntries(Object.entries(props).map(([key, value]) => [key, `calc(${value} * var(--u))`])) as CSSProperties;

export function BettaCard({ genome, playerId, name }: { genome: Genome; playerId: string; name: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [date] = useState(() => new Date());
  const lines = useMemo(() => traits(genome), [genome]);
  const lineH = CARD.lineH(lines.length);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const shoot = async (fish: Blob) => {
    try {
      const card = await composeCard({ fish, genome, date });
      setFile(new File([card], `betta-${name}.png`, { type: "image/png" }));
      setUrl(URL.createObjectURL(card));
    } catch {
      setFailed(true);
    }
  };

  const canShare = file !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "My betta", text: "My betta, from betta project." });
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

  const { frame, margin, fish } = CARD;
  return (
    <main className={styles.root}>
      <div className={styles.stage}>
        <div className={styles.column}>
          <article className={styles.card} aria-label="Betta card" style={{ ["--card-font" as string]: CARD_FONT }}>
            <div className={styles.inner}>
              <div className={styles.frame} style={at({ left: frame, top: frame, right: frame, bottom: frame })} />
              <div className={styles.fish} style={at({ left: fish.x, top: fish.y, width: fish.w, height: fish.h })}>
                <CardFish genome={genome} playerId={playerId} />
              </div>
              <div className={styles.rule} style={at({ left: margin, right: margin, top: CARD.rule })} />
              <dl className={styles.traits}>
                {lines.map(({ label, text }, i) => (
                  <div key={label} className={styles.trait}
                    style={at({ left: margin, right: margin, top: CARD.traitsTop + i * lineH - CARD_FONT })}>
                    <dt>{label.toUpperCase()}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
              <p className={styles.footer} style={at({ left: margin, right: margin, top: CARD.footer - CARD_FONT })}>
                <span>{cardDate(date)}</span>
                <span>{CARD_FOOTER}</span>
              </p>
            </div>
          </article>
          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={!url} onClick={save}>Save</button>
            {canShare && <button type="button" className={styles.button} onClick={share}>Share</button>}
          </div>
        </div>
      </div>
      {!url && !failed && <CardSnapshot genome={genome} playerId={playerId} onShot={shoot} />}
    </main>
  );
}
