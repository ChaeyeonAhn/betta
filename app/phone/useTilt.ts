"use client";

// How far the phone is tilted from how it was held when it started (or was
// last recalibrated): x to the right, y toward the floor, about -1…1 at
// TILT_DEG. It reads the direction of "up" in the phone's own frame rather
// than the raw angles, so it stays steady with the phone held upright, where
// beta and gamma flip. iOS only reports the sensor after a tap grants it.

import { useCallback, useEffect, useRef, useState } from "react";

export type Tilt = { x: number; y: number };
type Vec = [number, number, number];

const rad = Math.PI / 180;
const TILT_DEG = 24;
const RANGE = Math.sin(TILT_DEG * rad);

/** World up in the phone's frame (x right, y toward the top edge, z out of the screen; W3C angles). */
function upInDevice(beta: number, gamma: number): Vec {
  const cb = Math.cos(beta * rad), sb = Math.sin(beta * rad);
  const cg = Math.cos(gamma * rad), sg = Math.sin(gamma * rad);
  return [-sg * cb, sb, cg * cb];
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec): Vec => {
  const length = Math.hypot(...a) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * The resting pose's two tilt axes. Tipping the top edge away from you turns
 * "up" toward `forward`; dipping the right edge turns it away from `right`.
 */
function axes(rest: Vec) {
  const forward = normalize(cross([1, 0, 0], rest));
  return { forward, right: cross(rest, forward) };
}

export function useTilt() {
  const tilt = useRef<Tilt>({ x: 0, y: 0 });
  const frame = useRef<ReturnType<typeof axes> | null>(null);
  const [active, setActive] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    let spoke = false;
    const onTurn = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const up = upInDevice(e.beta, e.gamma);
      if (!spoke) {
        spoke = true;
        setActive(true);
        setNeedsTap(false);
      }
      const f = frame.current ??= axes(up);
      tilt.current = { x: clamp(-dot(up, f.right) / RANGE), y: clamp(dot(up, f.forward) / RANGE) };
    };
    window.addEventListener("deviceorientation", onTurn);

    // iOS: ask on the first touch, and listen again once granted (an earlier
    // listener can stay silent until a reload).
    const Orientation = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    const ask = () => {
      window.removeEventListener("touchend", ask);
      window.removeEventListener("click", ask);
      Orientation?.requestPermission?.()
        .then((answer) => {
          if (answer !== "granted") return;
          window.removeEventListener("deviceorientation", onTurn);
          window.addEventListener("deviceorientation", onTurn);
        })
        .catch(() => {});
    };
    let quiet: ReturnType<typeof setTimeout> | undefined;
    if (Orientation?.requestPermission) {
      window.addEventListener("touchend", ask);
      window.addEventListener("click", ask);
      quiet = setTimeout(() => setNeedsTap(!spoke), 800);
    }
    return () => {
      clearTimeout(quiet);
      window.removeEventListener("deviceorientation", onTurn);
      window.removeEventListener("touchend", ask);
      window.removeEventListener("click", ask);
    };
  }, []);

  /** Take however the phone is held now as level. */
  const recalibrate = useCallback(() => {
    frame.current = null;
    tilt.current = { x: 0, y: 0 };
  }, []);

  return { tilt, active, needsTap, recalibrate };
}
