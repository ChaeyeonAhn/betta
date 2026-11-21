"use client";

// Open stage on the phone: drag inside the circle to 원을 드래그해 베타가 갈 방향을 정하세요..
// Sends {x, y} in -1…1 about 20 times a second while held, and 0,0 on release.
// The screen adds it as one force among schooling and personal space, so the
// fish follows, but not perfectly.

import { useEffect, useRef, useState } from "react";
import type { Genome, Steer } from "@/lib/protocol";
import { BettaPreview } from "../BettaPreview";
import styles from "./controls.module.css";

const RADIUS = 110;
const SEND_MS = 50;

export function Joystick({ genome, playerId, tag, onSteer }: {
  genome: Genome;
  playerId: string;
  tag: string;
  onSteer: (steer: Steer) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const steer = useRef<Steer>({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => onSteer(steer.current), SEND_MS);
    return () => clearInterval(timer);
  }, [active, onSteer]);

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
    steer.current = { x: x / RADIUS, y: y / RADIUS };
    if (force) onSteer(steer.current);
  };

  const stop = () => {
    setActive(false);
    setKnob({ x: 0, y: 0 });
    steer.current = { x: 0, y: 0 };
    onSteer(steer.current);
  };

  return (
    <main className={styles.root}>
      <div className={styles.me}>
        <BettaPreview genome={genome} playerId={playerId} tag={tag} width={188} />
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
      <p className={styles.top}>원을 드래그해 베타가 갈 방향을 정하세요.</p>
    </main>
  );
}
