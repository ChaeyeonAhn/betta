"use client";

import { useEffect, useMemo, useState } from "react";
import { useBetta } from "@/hooks/useBetta";
import type { AdminCommand, Hello } from "@/lib/protocol";
import styles from "./screen.module.css";

type Props = {
  room: string;
  adminKey?: string;
  /** Base URL phones open (tunnel / deployed). Null = this host on the LAN IP. */
  publicUrl: string | null;
  lanIp: string | null;
  socketUrl: string | null;
};

// Admin keys: 1 / 2 = mode A / B, Space or → = next stage, R = reset, H = hide HUD.
export function Screen({ room, adminKey, publicUrl, lanIp, socketUrl }: Props) {
  const hello = useMemo<Hello>(() => ({ role: "screen", room, adminKey }), [room, adminKey]);
  const { state, connected, rejected, socket } = useBetta(hello, socketUrl);
  const [hud, setHud] = useState(true);
  const [joinUrl, setJoinUrl] = useState("");

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
      if (event.key === "1") send({ cmd: "setMode", mode: "A" });
      else if (event.key === "2") send({ cmd: "setMode", mode: "B" });
      else if (event.key === " " || event.key === "ArrowRight") send({ cmd: "next" });
      else if (event.key === "r" || event.key === "R") send({ cmd: "reset" });
      else if (event.key === "h" || event.key === "H") setHud((v) => !v);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [socket]);

  const players = state?.players ?? [];
  const online = players.filter((p) => p.connected).length;

  return (
    <main className={styles.root}>
      <section className={styles.stage}>
        <p className={styles.stageName}>{state?.stage ?? "…"}</p>
        {state?.stage === "lobby" && (
          <p className={styles.join}>
            {joinUrl}
            <br />
            <span className={styles.count}>{online}</span> in the water
          </p>
        )}
      </section>

      {hud && (
        <aside className={styles.hud}>
          <p>
            server {connected ? "●" : "○"} · room {room} · mode {state?.mode ?? "-"} · stage {state?.stage ?? "-"}
          </p>
          {!adminKey && <p className={styles.keys}>no ?key= → keys only work if the server has no ADMIN_KEY</p>}
          {rejected && <p className={styles.error}>rejected: {rejected}</p>}
          <p>
            players {online}/{players.length}
          </p>
          <ul>
            {players.map((p) => (
              <li key={p.id}>
                {p.connected ? "●" : "○"} {p.id.slice(0, 6)} · {p.phase}
                {p.done ? " · done" : ""}
              </li>
            ))}
          </ul>
          <p className={styles.keys}>1/2 mode · space next · R reset · H hide</p>
        </aside>
      )}
    </main>
  );
}
