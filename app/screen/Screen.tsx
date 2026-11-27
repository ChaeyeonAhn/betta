"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBetta } from "@/hooks/useBetta";
import type { AdminCommand, Hello, SessionState } from "@/lib/protocol";
import { ProjectionControls, useProjectionScale } from "./ProjectionControls";
import { Landing } from "./Landing";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { WATER_ENTRY_MS, WATER_ENTRY_REDUCED_MS, type WaterEntry } from "@/app/_components/waterEntry";
import { Grid } from "./scenes/Grid";
import { Open } from "./scenes/Open";
import { STAGE_H, STAGE_W } from "./scenes/gridLayout";
import { useAmbience } from "./useAmbience";
import styles from "./screen.module.css";

const GRID_FADE_MS = 2200;

type Props = {
  room: string;
  adminKey?: string;
  socketUrl: string | null;
};

// Admin keys (not shown anywhere): Space or → = next stage, Shift+Space = skip to born,
// R = reset, P = drop disconnected phones, H = hide the player count and the size control.
export function Screen({ room, adminKey, socketUrl }: Props) {
  const hello = useMemo<Hello>(() => ({ role: "screen", room, adminKey }), [room, adminKey]);
  const { state, connected, socket } = useBetta(hello, socketUrl);
  const [hud, setHud] = useState(true);
  const [diveArmed, setDiveArmed] = useState(false);
  const onDiveEnd = useCallback(() => setDiveArmed(false), []);
  const projection = useProjectionScale();
  // The tank hum runs under every stage, from the lobby on.
  useAmbience(true);

  useEffect(() => {
    // A fresh connected lobby snapshot arms the next dive. Reconnecting alone
    // must not arm it from useBetta's retained, potentially stale snapshot.
    if (state?.stage === "lobby" && socket.current?.connected) setDiveArmed(true);
    else if (state?.stage !== "input") setDiveArmed(false);
  }, [state, socket]);

  useEffect(() => {
    if (!connected) setDiveArmed(false);
  }, [connected]);

  useEffect(() => {
    const send = (command: AdminCommand) => socket.current?.emit("admin", command);
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "h" || event.key === "H") {
        setHud((value) => !value);
        event.preventDefault();
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest("input, button, summary")) return;
      if (event.key === " " && event.shiftKey && state?.stage === "input") send({ cmd: "goto", stage: "born" });
      else if (event.key === " " || event.key === "ArrowRight") send({ cmd: "next" });
      else if (event.key === "r" || event.key === "R") send({ cmd: "reset" });
      else if (event.key === "p" || event.key === "P") send({ cmd: "prune" });
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [socket, state?.stage]);

  const players = state?.players ?? [];
  const online = players.filter((p) => p.connected).length;
  // One person icon per player on the landing pool; null until the first snapshot.
  const floaters = useMemo(
    () => (state ? state.players.map(({ id, connected }) => ({ id, connected })) : null),
    [state],
  );
  const stage = state?.stage;
  // Bettas grow on the phones and go straight into the grid as each one is done.
  const emptyInput = stage === "input" && !players.some((player) => player.genome && player.slot !== null);
  const diving = stage === "input" && connected && diveArmed;
  // Until the first snapshot arrives the screen shows the lobby, not a black frame.
  const lobby = !state || stage === "lobby";
  const entry: WaterEntry = lobby ? "lobby" : diving ? "diving" : "underwater";
  const caged = stage === "born" || stage === "grid" || (stage === "input" && !emptyInput);
  // When the walls come down, the empty grid stays a moment over the open tank and fades away.
  const lastGrid = useRef<SessionState | null>(null);
  if (stage === "grid" && state) lastGrid.current = state;
  const [leaving, setLeaving] = useState<SessionState | null>(null);
  useEffect(() => {
    if (stage !== "open" || !lastGrid.current) return;
    setLeaving(lastGrid.current);
    lastGrid.current = null;
    const timer = setTimeout(() => setLeaving(null), GRID_FADE_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  return (
    <main className={styles.root} data-stage={stage} data-connected={connected}>
      <div className={styles.frame} style={{
        width: STAGE_W,
        height: STAGE_H,
        transform: `translate(calc(-50% + ${projection.offset.x}px), calc(-50% + ${projection.offset.y}px)) scale(${projection.scale.x / 100}, ${projection.scale.y / 100})`,
      }}>
        {caged && state && <Grid state={state} />}
        {stage === "open" && state && <Open players={players} gridSize={state.gridSize} socket={socket} />}
        {stage === "open" && leaving && (
          <div className={styles.gridLeaving} style={{ animationDuration: `${GRID_FADE_MS}ms` }}>
            <Grid state={leaving} leaving />
          </div>
        )}
        {(lobby || diving || emptyInput) && (
          <div className={styles.entry} data-entry={entry} style={{
            "--entry-duration": `${WATER_ENTRY_MS}ms`,
            "--entry-reduced-duration": `${WATER_ENTRY_REDUCED_MS}ms`,
          } as React.CSSProperties}>
            {entry !== "underwater" && <Landing diving={diving} onDiveEnd={onDiveEnd} joined={players.length} />}
            <div className={styles.ocean}>
              <WaterBackdrop entry={entry} floaters={floaters} />
            </div>
          </div>
        )}
      </div>

      {/* Just outside the display, under its bottom edge: the player count and the size control. */}
      {hud && (
        <div className={styles.dock} style={{
          "--display-w": `${(STAGE_W * projection.scale.x) / 100}px`,
          "--display-h": `${(STAGE_H * projection.scale.y) / 100}px`,
          "--display-x": `${projection.offset.x}px`,
          "--display-y": `${projection.offset.y}px`,
        } as React.CSSProperties}>
          <p className={styles.count}>{online}/{players.length}</p>
          <ProjectionControls {...projection} />
        </div>
      )}
    </main>
  );
}
