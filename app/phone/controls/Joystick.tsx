"use client";

// Open stage on the phone: drag inside the circle to steer your betta.
// Sends {x, y} in -1…1 about 20 times a second while held, and 0,0 on release.
// The screen adds it as one force among schooling and personal space, so the
// fish follows, but not perfectly.

import { useRef, useState } from "react";
import { BettaShape } from "@/app/_components/BettaShape";
import type { Genome, Steer } from "@/lib/protocol";
import styles from "./controls.module.css";

const RADIUS = 110;
const SEND_MS = 50;

export function Joystick({ genome, tag, onSteer }: { genome: Genome; tag: string; onSteer: (s: Steer) => void }) {
  const padRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const move = (clientX: number, clientY: number, force = false) => {
    const rect = padRef.current!.getBoundingClientRect();
    let x = clientX - (rect.left + rect.width / 2);
    let y = clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(x, y);
    if (len > RADIUS) {
      x = (x / len) * RADIUS;
      y = (y / len) * RADIUS;
    }
    setKnob({ x, y });
    const now = performance.now();
    if (force || now - lastSent.current > SEND_MS) {
      lastSent.current = now;
      onSteer({ x: x / RADIUS, y: y / RADIUS });
    }
  };

  const stop = () => {
    setActive(false);
    setKnob({ x: 0, y: 0 });
    onSteer({ x: 0, y: 0 });
  };

  return (
    <main className={styles.root}>
      <div className={styles.me}>
        <BettaShape genome={genome} size={120} label={tag} />
      </div>
      <div
        ref={padRef}
        className={styles.stick}
        style={{ width: RADIUS * 2 + 40, height: RADIUS * 2 + 40 }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setActive(true);
          move(e.clientX, e.clientY, true);
        }}
        onPointerMove={(e) => active && move(e.clientX, e.clientY)}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <div className={styles.knob} style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <p className={styles.top}>steer your betta</p>
    </main>
  );
}
