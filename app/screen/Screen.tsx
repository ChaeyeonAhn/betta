"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBetta } from "@/hooks/useBetta";
import type { AdminCommand, Hello, SessionState } from "@/lib/protocol";
import { ProjectionControls, useProjectionScale } from "./ProjectionControls";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { Grid } from "./scenes/Grid";
import { Open } from "./scenes/Open";
import { STAGE_H, STAGE_W } from "./scenes/gridLayout";
import { useAmbience } from "./useAmbience";
import styles from "./screen.module.css";

const GRID_FADE_MS = 2200;

type Props = {
  room: string;
  adminKey?: string;
  /** Base URL phones open (tunnel / deployed). Null = this host on the LAN IP. */
  publicUrl: string | null;
  lanIp: string | null;
  socketUrl: string | null;
};

// Admin keys (not shown anywhere): Space or → = next stage, Shift+Space = skip to born,
// R = reset, P = drop disconnected phones, H = hide the player count and the size control.
export function Screen({ room, adminKey, publicUrl, lanIp, socketUrl }: Props) {
  const hello = useMemo<Hello>(() => ({ role: "screen", room, adminKey }), [room, adminKey]);
  const { state, connected, socket } = useBetta(hello, socketUrl);
  const [hud, setHud] = useState(true);
  const [joinUrl, setJoinUrl] = useState("");
  const projection = useProjectionScale();
  // The tank hum runs under every stage, from the lobby on.
  useAmbience(true);

  useEffect(() => {
    const query = `/phone?room=${encodeURIComponent(room)}`;
    if (publicUrl) {
      setJoinUrl(publicUrl.replace(/\/$/, "") + query);
      return;
    }
    // Deployed (or any non-local host): phones open the same origin.
    const { hostname } = window.location;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      setJoinUrl(window.location.origin + query);
      return;
    }
    const host = lanIp ?? hostname;
    const port = window.location.port ? `:${window.location.port}` : "";
    setJoinUrl(`${window.location.protocol}//${host}${port}${query}`);
  }, [publicUrl, lanIp, room]);

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
  const stage = state?.stage;
  // Bettas grow on the phones and go straight into the grid as each one is done.
  const caged = stage === "born" || stage === "grid" || stage === "input";
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
        transform: `translate(-50%, -50%) scale(${projection.scale.x / 100}, ${projection.scale.y / 100})`,
      }}>
        {!caged && stage !== "open" && <WaterBackdrop />}
        {caged && state && <Grid state={state} />}
        {stage === "open" && state && <Open players={players} gridSize={state.gridSize} socket={socket} />}
        {stage === "open" && leaving && (
          <div className={styles.gridLeaving} style={{ animationDuration: `${GRID_FADE_MS}ms` }}>
            <Grid state={leaving} leaving />
          </div>
        )}
        {stage === "lobby" && (
          <section className={styles.stage}>
            <img className={styles.lobby} src="/qr-code.svg" alt={`Scan to join · ${joinUrl}`} />
          </section>
        )}
      </div>

      {/* Just outside the display, under its bottom edge: the player count and the size control. */}
      {hud && (
        <div className={styles.dock} style={{
          "--display-w": `${(STAGE_W * projection.scale.x) / 100}px`,
          "--display-h": `${(STAGE_H * projection.scale.y) / 100}px`,
        } as React.CSSProperties}>
          <p className={styles.count}>{online}/{players.length}</p>
          <ProjectionControls {...projection} />
        </div>
      )}
    </main>
  );
}
