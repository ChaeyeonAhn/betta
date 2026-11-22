"use client";

// Open stage sound: two bettas bumping into each other set off a burst of
// bubbles (bubble-cluster); two drifting close make a low gulp. Pitch follows
// the pair's fins (longer = lower), pan where they are on the stage, and depth
// makes it quieter.

import { loadSound, playSound } from "@/app/_components/sound";
import type { Genome } from "@/lib/protocol";
import { STAGE_W } from "./gridLayout";
import { TANK_DEPTH } from "./waterCurrent";

const CLUSTER = "/audio/bubbles/bubble-cluster.mp3";
const GULP = "/audio/bubbles/bubble-gulp.mp3";

/** Distances in the sim's own measure (the `d` in Open's pair loop). */
const BUMP = 75;
const NEAR = 220;
/** A pair has to drift this far apart again before the same event can repeat. */
const BUMP_REARM = BUMP * 1.4;
const NEAR_REARM = NEAR * 1.3;
const PAIR_COOLDOWN_MS = 6000;
const MAX_PER_SECOND = 3;
/** Fish leave the grid packed together: listen only once they've spread out. */
const SETTLE_MS = 3000;

type Fish = { x: number; depth: number; genome: Genome };
type Pair = { near: boolean; bump: boolean; nearQuiet: number; bumpQuiet: number };

export function createBubbleEvents(start: number) {
  const sounds = Promise.all([loadSound(CLUSTER), loadSound(GULP)]);
  sounds.catch((error) => console.warn("[betta] bubble sounds failed to load", error));
  const pairs = new Map<string, Pair>();
  const fired: number[] = [];

  const play = (now: number, kind: "bump" | "near", a: Fish, b: Fish) => {
    while (fired.length && now - fired[0] > 1000) fired.shift();
    if (fired.length >= MAX_PER_SECOND) return;
    fired.push(now);
    const fin = (a.genome.finLength + b.genome.finLength) / 2;
    const depth = Math.min(1, (a.depth + b.depth) / 2 / TANK_DEPTH);
    const options = {
      rate: Math.pow(2, (0.5 - fin) * 0.8) * (0.96 + Math.random() * 0.08),
      gain: (kind === "bump" ? 1 : 0.8) * (1 - 0.6 * depth),
      pan: (((a.x + b.x) / 2 / STAGE_W) * 2 - 1) * 0.8,
    };
    void sounds.then(([cluster, gulp]) => playSound(kind === "bump" ? cluster : gulp, options)).catch(() => {});
  };

  return {
    /** Call once per pair per frame, with idA < idB, and the distance between them. */
    pair(now: number, idA: string, a: Fish, idB: string, b: Fish, d: number) {
      const key = `${idA}|${idB}`;
      let p = pairs.get(key);
      if (!p) {
        // First sight: take the pair as it is, without a sound.
        pairs.set(key, { near: d < NEAR, bump: d < BUMP, nearQuiet: 0, bumpQuiet: 0 });
        return;
      }
      const listening = now - start > SETTLE_MS;
      if (!p.bump && d < BUMP) {
        p.bump = true;
        if (listening && now > p.bumpQuiet) {
          p.bumpQuiet = now + PAIR_COOLDOWN_MS;
          play(now, "bump", a, b);
        }
      } else if (p.bump && d > BUMP_REARM) p.bump = false;

      if (!p.near && d < NEAR) {
        p.near = true;
        if (listening && now > p.nearQuiet && !p.bump) {
          p.nearQuiet = now + PAIR_COOLDOWN_MS;
          play(now, "near", a, b);
        }
      } else if (p.near && d > NEAR_REARM) p.near = false;
    },
    /** Forget pairs whose fish have left. */
    prune(alive: { has(id: string): boolean }) {
      for (const key of pairs.keys()) {
        const [a, b] = key.split("|");
        if (!alive.has(a) || !alive.has(b)) pairs.delete(key);
      }
    },
  };
}
