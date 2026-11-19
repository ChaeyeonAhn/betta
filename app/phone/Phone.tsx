"use client";

import { useCallback, useEffect, useState } from "react";
import { useBetta } from "@/hooks/useBetta";
import { getPlayerId, shortTag } from "@/lib/playerId";
import type { FeedEvent, Hello } from "@/lib/protocol";
import { FakeFeed } from "./modes/FakeFeed";
import { Release } from "./Release";
import styles from "./phone.module.css";

export function Phone({ room, socketUrl }: { room: string; socketUrl: string | null }) {
  // The id lives in localStorage, so it can only be read after mount.
  const [hello, setHello] = useState<Hello | null>(null);
  useEffect(() => setHello({ role: "phone", room, playerId: getPlayerId() }), [room]);

  const { state, connected, rejected, socket } = useBetta(hello, socketUrl);
  const me = state?.players.find((p) => hello?.role === "phone" && p.id === hello.playerId);

  const sendFeed = useCallback(
    (batch: { events: FeedEvent[]; start?: boolean; done?: boolean }) => socket.current?.emit("feed", batch),
    [socket],
  );

  if (rejected) return <Centered>{rejected}</Centered>;
  if (!connected || !me || !state) return <Centered dim>connecting…</Centered>;

  if (me.phase === "input" && !me.done) {
    if (state.mode === "A") return <FakeFeed send={sendFeed} />;
    return <Centered dim>Mode B · dial pad (not built yet)</Centered>;
  }

  if (state.stage === "born" && me.genome) {
    return (
      <Release
        genome={me.genome}
        tag={shortTag(me.id)}
        released={me.released}
        onRelease={() => socket.current?.emit("release")}
      />
    );
  }

  return (
    <Centered>
      <p className={styles.title}>{me.phase === "waiting" ? "입수 완료" : me.done ? "Look up." : me.phase}</p>
      <p className={styles.dim}>
        stage {state.stage} · mode {state.mode}
      </p>
    </Centered>
  );
}

function Centered({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <main className={styles.root}>
      <div className={dim ? styles.dim : undefined}>{children}</div>
    </main>
  );
}
