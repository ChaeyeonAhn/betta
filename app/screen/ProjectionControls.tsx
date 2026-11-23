"use client";

import { useEffect, useState } from "react";
import { STAGE_H, STAGE_W } from "./scenes/gridLayout";
import styles from "./screen.module.css";

const STORAGE_KEY = "betta-projection-scale";
const DEFAULT_SCALE = { x: 100, y: 100 };
const DEFAULT_OFFSET = { x: 0, y: 0 };
const MIN_SCALE = 10;
const MAX_SCALE = 300;
/** Shift of the display's centre from the window's centre, in window px. */
const MAX_OFFSET = 2000;
const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value)));
const clampOffset = (value: number) => Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, Math.round(value)));

type Pair = { x: number; y: number };

export function useProjectionScale() {
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [offset, setOffset] = useState(DEFAULT_OFFSET);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        setScale({ x: clampScale(saved.x), y: clampScale(saved.y) });
      }
      if (saved && Number.isFinite(saved.offsetX) && Number.isFinite(saved.offsetY)) {
        setOffset({ x: clampOffset(saved.offsetX), y: clampOffset(saved.offsetY) });
      }
    } catch {}
  }, []);

  function save(nextScale: Pair, nextOffset: Pair) {
    const s = { x: clampScale(nextScale.x), y: clampScale(nextScale.y) };
    const o = { x: clampOffset(nextOffset.x), y: clampOffset(nextOffset.y) };
    setScale(s);
    setOffset(o);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, offsetX: o.x, offsetY: o.y })); } catch {}
  }

  const update = (x: number, y: number) => save({ x, y }, offset);
  const move = (x: number, y: number) => save(scale, { x, y });
  return { scale, offset, update, move, save };
}

export function ProjectionControls({ scale, offset, update, move, save }: ReturnType<typeof useProjectionScale>) {
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value} px`;
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
        <label>
          X <output>{signed(offset.x)}</output>
          <input type="range" min={-MAX_OFFSET} max={MAX_OFFSET} value={offset.x} onChange={(event) => move(Number(event.target.value), offset.y)} />
        </label>
        <label>
          Y <output>{signed(offset.y)}</output>
          <input type="range" min={-MAX_OFFSET} max={MAX_OFFSET} value={offset.y} onChange={(event) => move(offset.x, Number(event.target.value))} />
        </label>
        <div className={styles.calibrationActions}>
          <button type="button" onClick={() => save(DEFAULT_SCALE, DEFAULT_OFFSET)}>Initial setup</button>
          <button type="button" onClick={() => {
            const fit = Math.floor(100 * Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
            save({ x: fit, y: fit }, DEFAULT_OFFSET);
          }}>Fit to window</button>
        </div>
      </div>
    </details>
  );
}
