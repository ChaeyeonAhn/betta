"use client";

import { useEffect, useState } from "react";
import { STAGE_H, STAGE_W } from "./scenes/gridLayout";
import styles from "./screen.module.css";

const STORAGE_KEY = "betta-projection-scale";
const DEFAULT_SCALE = { x: 100, y: 100 };
const MIN_SCALE = 10;
const MAX_SCALE = 300;
const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value)));

export function useProjectionScale() {
  const [scale, setScale] = useState(DEFAULT_SCALE);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        setScale({ x: clampScale(saved.x), y: clampScale(saved.y) });
      }
    } catch {}
  }, []);

  function update(x: number, y: number) {
    const next = { x: clampScale(x), y: clampScale(y) };
    setScale(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }
  return { scale, update };
}

export function ProjectionControls({ scale, update }: ReturnType<typeof useProjectionScale>) {
  return (
    <details className={styles.calibration}>
      <summary>Projection size</summary>
      <div className={styles.calibrationBody}>
        <label>
          Width <output>{Math.round(STAGE_W * scale.x / 100)} px</output>
          <input type="range" min={MIN_SCALE} max={MAX_SCALE} value={scale.x} onChange={(event) => update(Number(event.target.value), scale.y)} />
        </label>
        <label>
          Height <output>{Math.round(STAGE_H * scale.y / 100)} px</output>
          <input type="range" min={MIN_SCALE} max={MAX_SCALE} value={scale.y} onChange={(event) => update(scale.x, Number(event.target.value))} />
        </label>
        <div className={styles.calibrationActions}>
          <button type="button" onClick={() => update(100, 100)}>1:1</button>
          <button type="button" onClick={() => {
            const fit = 100 * Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
            update(Math.floor(fit), Math.floor(fit));
          }}>Fit to window</button>
        </div>
      </div>
    </details>
  );
}
