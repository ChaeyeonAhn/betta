// Draws the 1080 × 1350 betta card: black paper, white lines, the betta, its
// tag and the traits its visitor gave it.

import type { Genome } from "@/lib/protocol";
import { traits } from "./traits";

const W = 1080;
const H = 1350;
const SERIF = '500 76px Baskerville, "Iowan Old Style", Georgia, serif';
const MONO = 'Menlo, "SF Mono", Consolas, monospace';
const SANS = '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

export async function composeCard({ fish, genome, tag, date }: {
  fish: Blob;
  genome: Genome;
  tag: string;
  date: Date;
}): Promise<Blob> {
  const image = await createImageBitmap(fish);
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.86)";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  ctx.fillStyle = "#f4f4f4";
  ctx.font = SERIF;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Betta", 88, 156);
  ctx.font = `28px ${MONO}`;
  ctx.textAlign = "right";
  ctx.fillText(tag, W - 88, 150);
  ctx.textAlign = "left";

  // The fish, centred in the upper part.
  const fishW = 920;
  const fishH = fishW * image.height / image.width;
  ctx.drawImage(image, (W - fishW) / 2, 190 + (650 - fishH) / 2, fishW, fishH);

  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(88, 860);
  ctx.lineTo(W - 88, 860);
  ctx.stroke();

  const lines = traits(genome);
  const lineH = lines.length > 6 ? 44 : 52;
  lines.forEach(({ label, text }, i) => {
    const y = 918 + i * lineH;
    ctx.fillStyle = "rgba(255,255,255,0.56)";
    ctx.font = `22px ${MONO}`;
    ctx.fillText(label.toUpperCase(), 88, y);
    ctx.fillStyle = "#f4f4f4";
    ctx.font = `32px ${SANS}`;
    ctx.fillText(text, 300, y);
  });

  ctx.fillStyle = "rgba(255,255,255,0.56)";
  ctx.font = `22px ${MONO}`;
  ctx.fillText(date.toISOString().slice(0, 10), 88, H - 76);
  ctx.textAlign = "right";
  ctx.fillText("still swimming in the shared tank", W - 88, H - 76);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("card"))), "image/png"));
}
