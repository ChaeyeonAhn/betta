// Inputs → Genome. Runs on the server (server/index.ts imports it with .ts).
// Every axis falls back to 0.5 when the visitor gave no signal for it.
// The weights are first guesses; tune them after watching real runs.

import type { FeedEvent, Genome } from "./protocol.ts";

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** a / (a + b) with a neutral prior, so one event doesn't pin an axis to 0 or 1. */
const ratio = (a: number, b: number, prior = 1) => (a + prior * 0.5) / (a + b + prior);

/** What the visitor did in the 45s feed. */
export function genomeFromFeed(events: FeedEvent[]): Genome {
  const count = (kind: FeedEvent["kind"], tag?: FeedEvent["tag"]) =>
    events.filter((e) => e.kind === kind && (tag === undefined || e.tag === tag)).length;
  const dwell = (tag?: FeedEvent["tag"]) =>
    events
      .filter((e) => e.kind === "dwell" && (tag === undefined || e.tag === tag))
      .reduce((sum, e) => sum + (e.ms ?? 0), 0);

  // hue: dwell-weighted average colour of the mood posts they lingered on.
  // Hue is circular, so average on the unit circle.
  let x = 0;
  let y = 0;
  for (const e of events) {
    if (e.kind !== "dwell" || e.tag !== "mood" || e.hue === undefined) continue;
    const w = e.ms ?? 0;
    x += Math.cos(e.hue * 2 * Math.PI) * w;
    y += Math.sin(e.hue * 2 * Math.PI) * w;
  }
  const hue = x === 0 && y === 0 ? 0.5 : ((Math.atan2(y, x) / (2 * Math.PI)) % 1 + 1) % 1;

  // saturation (ornate / selectively bred): drawn to others' best versions.
  const bragAttention = dwell("brag") / 1000 + count("like", "brag") * 2 + count("tap", "brag");
  const otherAttention = (dwell() - dwell("brag")) / 1000 + count("like") - count("like", "brag");
  const saturation = ratio(bragAttention, otherAttention, 4);

  // finLength (wanting to be seen): posting, and opening news about yourself.
  const finLength = clamp(ratio(count("tap", "self"), count("ignore", "self"), 2) * 0.7 + Math.min(count("post"), 2) * 0.15);

  // boundary: keeping strangers out.
  const keepOut = count("decline", "stranger") + count("ignore", "stranger") * 0.5;
  const letIn = count("accept", "stranger");
  const boundary = ratio(keepOut, letIn, 2);

  // sociability: answering friends vs letting everything slide.
  const answered = count("tap", "friend") + count("reply", "friend");
  const ignoredAll = count("ignore");
  const sociability = ratio(answered * 2, ignoredAll, 3);

  return { hue, saturation: clamp(saturation), finLength, boundary: clamp(boundary), sociability: clamp(sociability) };
}

/** Euclidean distance in the 5 axes (hue taken around the circle), 0 … ~2.2. */
export function genomeDistance(a: Genome, b: Genome): number {
  const dh = Math.min(Math.abs(a.hue - b.hue), 1 - Math.abs(a.hue - b.hue)) * 2;
  return Math.hypot(dh, a.saturation - b.saturation, a.finLength - b.finLength, a.boundary - b.boundary, a.sociability - b.sociability);
}
