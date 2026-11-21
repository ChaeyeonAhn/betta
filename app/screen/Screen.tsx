"use client";

import { useEffect, useMemo, useState } from "react";
import { useBetta } from "@/hooks/useBetta";
import type { AdminCommand, Hello } from "@/lib/protocol";
import { ANSWER_SCALE, SNS_QUESTIONS } from "@/lib/questions";
import { ProjectionControls, useProjectionScale } from "./ProjectionControls";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { Grid } from "./scenes/Grid";
import { Open } from "./scenes/Open";
import { STAGE_H, STAGE_W } from "./scenes/gridLayout";
import styles from "./screen.module.css";

type Props = {
  room: string;
  adminKey?: string;
  /** Base URL phones open (tunnel / deployed). Null = this host on the LAN IP. */
  publicUrl: string | null;
  lanIp: string | null;
  socketUrl: string | null;
};

// Admin keys: 1 / 2 = mode A / B, Space or → = next stage, R = reset, P = drop disconnected phones, H = hide HUD.
export function Screen({ room, adminKey, publicUrl, lanIp, socketUrl }: Props) {
  const hello = useMemo<Hello>(() => ({ role: "screen", room, adminKey }), [room, adminKey]);
  const { state, connected, rejected, socket } = useBetta(hello, socketUrl);
  const [hud, setHud] = useState(true);
  const [joinUrl, setJoinUrl] = useState("");
  const projection = useProjectionScale();

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
      if (event.key === "1") send({ cmd: "setMode", mode: "A" });
      else if (event.key === "2") send({ cmd: "setMode", mode: "B" });
      else if (event.key === " " && event.shiftKey && state?.stage === "input") send({ cmd: "goto", stage: "born" });
      else if (event.key === " " || event.key === "ArrowRight") send({ cmd: "next", question: state?.question?.index });
      else if (event.key === "r" || event.key === "R") send({ cmd: "reset" });
      else if (event.key === "p" || event.key === "P") send({ cmd: "prune" });
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [socket, state?.stage, state?.question?.index]);

  const players = state?.players ?? [];
  const online = players.filter((p) => p.connected).length;
  const stage = state?.stage;
  const question = stage === "input" ? state?.question : null;
  // Mode A's bettas grow on the phones and go straight into the grid as each one is done.
  const caged = stage === "born" || stage === "grid" || (stage === "input" && state?.mode === "A");

  return (
    <main className={styles.root}>
      <div className={styles.frame} style={{
        width: STAGE_W,
        height: STAGE_H,
        transform: `translate(-50%, -50%) scale(${projection.scale.x / 100}, ${projection.scale.y / 100})`,
      }}>
        {!caged && stage !== "open" && <WaterBackdrop />}
        {caged && state && <Grid state={state} />}
        {stage === "open" && state && <Open players={players} gridSize={state.gridSize} socket={socket} />}
        {!caged && stage !== "open" && (
          <section className={styles.stage}>
            {question && (
              <div className={styles.question}>
                <p className={styles.questionNumber}>{question.index + 1} / {SNS_QUESTIONS.length}</p>
                <h1>{SNS_QUESTIONS[question.index].prompt}</h1>
                <div className={styles.questionScale}>
                  <span><b>0</b> {ANSWER_SCALE.low}</span>
                  <span><b>10</b> {ANSWER_SCALE.high}</span>
                </div>
                <p className={styles.responses}>{question.answered} / {question.participants} answered</p>
              </div>
            )}
            {stage === "input" && state && !question && (
              <p className={styles.join}>
                answer on your phone
                <br />
                <span className={styles.count}>{players.filter((p) => p.done).length}</span> / {players.length} done
              </p>
            )}
            {stage === "lobby" && (
              <p className={styles.lobby}>{joinUrl}</p>
            )}
          </section>
        )}
      </div>

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
                {p.genome &&
                  ` · ${Object.values(p.genome)
                    .map((v) => v.toFixed(2))
                    .join(" ")}`}
              </li>
            ))}
          </ul>
          <p className={styles.keys}>1/2 mode · space next · Shift+Space skip to born · R reset · P prune · H hide</p>
        </aside>
      )}
      {hud && <ProjectionControls {...projection} />}
    </main>
  );
}
