// Draws the 1080 × 1350 betta card for Save / Share: black paper, white lines,
// a still side view of the betta and the traits its visitor gave it. The card
// on the phone (BettaCard.tsx) lays out the same boxes with a live betta.

import type { Genome } from "@/lib/protocol";
import { traits } from "./traits";

/** Card geometry in card pixels, shared with the on-screen card. */
export const CARD = {
  W: 1080,
  H: 1350,
  frame: 40,
  margin: 88,
  /** Where the betta is drawn: its snapshot is 720 × 504, scaled to this width. */
  fish: { x: 80, y: 118, w: 920, h: 644 },
  rule: 830,
  traitsTop: 902,
  lineH: (count: number) => (count > 6 ? 46 : 56),
  footer: 1274,
};

export const CARD_FOOTER = "BETTA PROJECT";
/** The betta's size in its 720 × 504 render (BettaModel units, 182 tall view). */
export const CARD_FISH_SIZE = 112 * 0.8;
/** Every word on the card: one monospace face, one size. */
export const CARD_FONT = 24;
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
export const cardDate = (date: Date) => date.toISOString().slice(0, 10);


export async function composeCard({ fish, genome, date }: {
  fish: Blob;
  genome: Genome;
  date: Date;
}): Promise<Blob> {
  const image = await createImageBitmap(fish);
  await document.fonts?.ready;
  const { W, H, frame, margin } = CARD;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(frame, frame, W - frame * 2, H - frame * 2);

  const { x, y, w, h } = CARD.fish;
  ctx.drawImage(image, x, y, w, h);

  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, CARD.rule);
  ctx.lineTo(W - margin, CARD.rule);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${CARD_FONT}px ${MONO}`;
  const lines = traits(genome);
  const lineH = CARD.lineH(lines.length);
  lines.forEach(({ label, text }, i) => {
    const ty = CARD.traitsTop + i * lineH;
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), margin, ty);
    ctx.textAlign = "right";
    ctx.fillText(text, W - margin, ty);
  });

  ctx.textAlign = "left";
  ctx.fillText(cardDate(date), margin, CARD.footer);
  ctx.textAlign = "right";
  ctx.fillText(CARD_FOOTER, W - margin, CARD.footer);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("card"))), "image/png"));
}
