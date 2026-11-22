"use client";

// Inside the cell: a quick turn of the phone stirs up bubbles. Only the moment
// the turn gets fast enough counts, so holding a fast spin doesn't machine-gun.

import { useEffect, type RefObject } from "react";
import { loadSound, playSound } from "@/app/_components/sound";
import type { Look } from "./useDeviceLook";

// Octave-up renders: phone speakers barely reach below ~400 Hz.
const CLUSTER = "/audio/bubbles/bubble-cluster-phone.mp3";
const GULP = "/audio/bubbles/bubble-gulp-phone.mp3";
const GULP_CHANCE = 0.25;
/** Degrees per second of turn (yaw and pitch together) that sets bubbles off. */
const TRIGGER_DEG_S = 90;
/** Has to settle under this before the next turn counts. */
const REARM_DEG_S = 45;
const COOLDOWN_MS = 1200;
/** Smoothing time for the turn speed, in seconds; hides sensor jitter. */
const SMOOTH_S = 0.08;

export function useTurnBubbles(look: RefObject<Look>) {
  useEffect(() => {
    const sounds = Promise.all([loadSound(CLUSTER), loadSound(GULP)]);
    sounds.catch((error) => console.warn("[betta] bubble sounds failed to load", error));

    let raf = 0;
    let last = performance.now();
    let prev = look.current;
    let speed = 0;
    let yawSpeed = 0;
    let armed = true;
    let quietUntil = 0;
    const tick = (now: number) => {
      const dt = Math.max(0.001, (now - last) / 1000);
      last = now;
      const cur = look.current;
      const dyaw = (cur.yaw - prev.yaw) / dt;
      const dpitch = (cur.pitch - prev.pitch) / dt;
      prev = cur;
      const k = Math.min(1, dt / SMOOTH_S);
      speed += (Math.hypot(dyaw, dpitch) - speed) * k;
      yawSpeed += (dyaw - yawSpeed) * k;

      if (armed && speed > TRIGGER_DEG_S && now > quietUntil) {
        armed = false;
        quietUntil = now + COOLDOWN_MS;
        const pan = Math.max(-0.7, Math.min(0.7, yawSpeed / 200)); // turning right → bubbles on the right
        void sounds.then(([cluster, gulp]) => playSound(Math.random() < GULP_CHANCE ? gulp : cluster, {
          rate: 0.92 + Math.random() * 0.16,
          gain: 0.9,
          pan,
        })).catch(() => {});
      } else if (!armed && speed < REARM_DEG_S) {
        armed = true;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [look]);
}
