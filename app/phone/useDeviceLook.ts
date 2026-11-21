"use client";

// Where the visitor is looking, from the phone's orientation sensor: yaw and
// pitch in degrees, relative to how they held the phone at first. Phones
// without a sensor (desktop, or a plain-http page) drag to look instead; a
// touch that barely moves counts as a tap.

import { useEffect, useRef, type PointerEvent } from "react";

export type Look = { yaw: number; pitch: number };

const rad = Math.PI / 180;
const PITCH_LIMIT = 70;
const TAP_SLOP = 8;
const DRAG_DEG_PER_PX = 0.25;

/**
 * Turning right is +yaw, looking up is +pitch. The heading uses the horizontal
 * parts of the phone's top edge and of the direction its back faces, which
 * agree on "forward" whether it is held flat or upright (W3C Z-X'-Y'' angles).
 */
function pose(alpha: number, beta: number, gamma: number): Look {
  const ca = Math.cos(alpha * rad), sa = Math.sin(alpha * rad);
  const cb = Math.cos(beta * rad), sb = Math.sin(beta * rad);
  const cg = Math.cos(gamma * rad), sg = Math.sin(gamma * rad);
  const x = -sa * cb - ca * sg - sa * sb * cg;
  const y = ca * cb - sa * sg + ca * sb * cg;
  return {
    yaw: Math.atan2(x, y) / rad,
    pitch: Math.asin(Math.max(-1, Math.min(1, -cb * cg))) / rad,
  };
}

const wrap = (deg: number) => ((deg + 540) % 360) - 180;
const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

export function useDeviceLook({ clampYaw, onTap }: {
  /** Keep yaw within ±this; turning further drags the origin along. Omit for a full turn. */
  clampYaw?: number;
  onTap?: () => void;
} = {}) {
  const look = useRef<Look>({ yaw: 0, pitch: 0 });
  const tap = useRef(onTap);
  tap.current = onTap;
  const drag = useRef<{ x: number; y: number; moved: boolean; from: Look } | null>(null);

  useEffect(() => {
    let origin: Look | null = null;
    let last = 0;
    let yaw = 0;
    const onTurn = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;
      const now = pose(e.alpha, e.beta, e.gamma);
      if (origin === null) {
        origin = now;
        last = now.yaw;
      }
      // Unwrap, so a full turn keeps counting instead of jumping at ±180.
      yaw += wrap(now.yaw - last);
      last = now.yaw;
      if (clampYaw !== undefined && Math.abs(yaw) > clampYaw) yaw = clamp(yaw, clampYaw);
      look.current = { yaw, pitch: clamp(now.pitch - origin.pitch, PITCH_LIMIT) };
    };
    window.addEventListener("deviceorientation", onTurn);

    // iOS only reports orientation after a tap grants it, and a listener added
    // before the grant can stay silent until a reload: attach it again once granted.
    // touchend/click count as the user gesture the permission prompt needs.
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
    if (Orientation?.requestPermission) {
      window.addEventListener("touchend", ask);
      window.addEventListener("click", ask);
    }

    return () => {
      window.removeEventListener("deviceorientation", onTurn);
      window.removeEventListener("touchend", ask);
      window.removeEventListener("click", ask);
    };
  }, [clampYaw]);

  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, moved: false, from: look.current };
    },
    onPointerMove: (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      d.moved = true;
      // Dragging moves the water with the finger, like turning the other way.
      const yaw = d.from.yaw - dx * DRAG_DEG_PER_PX;
      look.current = {
        yaw: clampYaw === undefined ? yaw : clamp(yaw, clampYaw),
        pitch: clamp(d.from.pitch + dy * DRAG_DEG_PER_PX, PITCH_LIMIT),
      };
    },
    onPointerUp: () => {
      if (drag.current && !drag.current.moved) tap.current?.();
      drag.current = null;
    },
    onPointerCancel: () => { drag.current = null; },
  };

  return { look, handlers };
}
