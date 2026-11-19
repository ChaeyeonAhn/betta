"use client";

import { useEffect, useState } from "react";
import { useBetta } from "@/hooks/useBetta";
import { getPlayerId } from "@/lib/playerId";
import type { Hello } from "@/lib/protocol";
import styles from "./phone.module.css";

export function Phone({ room, socketUrl }: { room: string; socketUrl: string | null }) {
  // The id lives in localStorage, so it can only be read after mount.
  const [hello, setHello] = useState<Hello | null>(null);
  useEffect(() => setHello({ role: "phone", room, playerId: getPlayerId() }), [room]);

  const { state, connected, rejected } = useBetta(hello, socketUrl);
  const me = state?.players.find((p) => hello?.role === "phone" && p.id === hello.playerId);

  return (
    <main className={styles.root}>
      {rejected ? (
        <p>{rejected}</p>
      ) : !connected || !me ? (
        <p className={styles.dim}>connecting…</p>
      ) : (
        <>
          <p className={styles.title}>{me.phase === "waiting" ? "입수 완료" : me.phase}</p>
          <p className={styles.dim}>
            stage {state?.stage} · mode {state?.mode}
          </p>
        </>
      )}
    </main>
  );
}
