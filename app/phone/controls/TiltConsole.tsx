"use client";

// Open stage on the phone: tilt to steer. However the phone is held when the
// console opens is level; tipping it moves the fish that way (right edge down:
// right; top edge away: down; toward you: up). A dot in the ring shows the
// tilt like a spirit level, and the arrow on the side it leans to lights up.
// A tap takes the current pose as level again. Without a sensor (desktop,
// plain http) dragging the ring steers instead. Sends {x, y} in -1…1 about
// 20 times a second; the screen adds it as the strongest of the fish's forces.

import { useEffect, useRef, useState } from "react";
import { Hint } from "@/app/_components/Hint";
import type { Steer } from "@/lib/protocol";
import { useTilt } from "../useTilt";
import styles from "./controls.module.css";

const RADIUS = 110;
const SEND_MS = 50;
/** Tilt this small (of the full range) still counts as level. */
const DEAD = 0.12;
const TAP_SLOP = 8;

const ease = (v: number) => {
  const size = Math.max(0, (Math.abs(v) - DEAD) / (1 - DEAD));
  return Math.sign(v) * size;
};

export function TiltConsole({ onSteer }: { onSteer: (steer: Steer) => void }) {
  const { tilt, active, needsTap, recalibrate } = useTilt();
  const pad = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const arrows = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ x: number; y: number; moved: boolean; steer: Steer } | null>(null);
  const [, redraw] = useState(0);

  // What the console says now: the finger while dragging, else the tilt.
  const current = (): Steer => {
    if (drag.current?.moved) return drag.current.steer;
    if (!active) return { x: 0, y: 0 };
    return { x: ease(tilt.current.x), y: ease(tilt.current.y) };
  };

  useEffect(() => {
    const timer = setInterval(() => onSteer(current()), SEND_MS);
    return () => {
      clearInterval(timer);
      onSteer({ x: 0, y: 0 });
    };
  }, [onSteer, active]);

  // Draw the level every frame, without React.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const { x, y } = current();
      if (dot.current) dot.current.style.transform = `translate(${x * RADIUS}px, ${y * RADIUS}px)`;
      // up, right, down, left
      [-y, x, y, -x].forEach((lean, i) => {
        const arrow = arrows.current[i];
        if (arrow) arrow.style.opacity = String(0.22 + 0.78 * Math.max(0, lean));
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const toSteer = (clientX: number, clientY: number): Steer => {
    const rect = pad.current!.getBoundingClientRect();
    let x = clientX - (rect.left + rect.width / 2);
    let y = clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(x, y);
    if (length > RADIUS) {
      x = (x / length) * RADIUS;
      y = (y / length) * RADIUS;
    }
    return { x: x / RADIUS, y: y / RADIUS };
  };

  return (
    <main
      className={`${styles.root} ${styles.console}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, moved: false, steer: toSteer(e.clientX, e.clientY) };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP) return;
        d.moved = true;
        d.steer = toSteer(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        // A tap, not a drag: wherever the phone is now becomes level.
        if (drag.current && !drag.current.moved) {
          recalibrate();
          navigator.vibrate?.(8);
          redraw((n) => n + 1);
        }
        drag.current = null;
      }}
      onPointerCancel={() => { drag.current = null; }}
    >
      <div ref={pad} className={styles.level} style={{ width: RADIUS * 2 + 40, height: RADIUS * 2 + 40 }}>
        <div className={styles.ring} />
        <div className={styles.center} />
        {(["up", "right", "down", "left"] as const).map((side, i) => (
          <div key={side} ref={(el) => { arrows.current[i] = el; }} className={styles.arrow} data-side={side} />
        ))}
        <div ref={dot} className={styles.dot} />
      </div>
      {(needsTap || !active) && <Hint kind={needsTap ? "tap" : "steer"} size={56} className={styles.consoleHint} />}
    </main>
  );
}
