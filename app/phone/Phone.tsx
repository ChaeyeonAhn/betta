"use client";

import { useCallback, useEffect, useState } from "react";
import { useBetta } from "@/hooks/useBetta";
import { getPlayerId, shortTag } from "@/lib/playerId";
import type { FeedEvent, Hello, Steer } from "@/lib/protocol";
import { Joystick } from "./controls/Joystick";
import { TapPad } from "./controls/TapPad";
import { FakeFeed } from "./modes/FakeFeed";
import { QuestionDial } from "./modes/QuestionDial";
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
  const sendSteer = useCallback((steer: Steer) => socket.current?.emit("steer", steer), [socket]);

  if (rejected) return <Centered>{rejected}</Centered>;
  if (!connected || !me || !state) return <Centered dim>수조에 연결하는 중…</Centered>;

  if (me.phase === "input" && !me.done) {
    if (state.mode === "A") return <FakeFeed send={sendFeed} />;
    if (!me.question) return <Centered dim>질문을 기다리는 중…</Centered>;
    return <QuestionDial
      playerId={me.id}
      question={me.question}
      onAnswer={(q, value) => socket.current?.emit("answer", { q, value })}
    />;
  }

  if (state.stage === "born" && me.genome) {
    return (
      <Release
        genome={me.genome}
        playerId={me.id}
        tag={shortTag(me.id)}
        released={me.released}
        onRelease={() => socket.current?.emit("release")}
      />
    );
  }

  if (state.stage === "grid" && me.genome) {
    return <TapPad state={state} mine={me.effort} onTap={() => socket.current?.emit("effort", { amount: 1 })} />;
  }

  if (state.stage === "open" && me.genome) {
    return <Joystick genome={me.genome} playerId={me.id} tag={shortTag(me.id)} onSteer={sendSteer} />;
  }

  return (
    <Centered>
      <p className={styles.title}>{me.phase === "waiting" ? "입수 완료" : me.done ? "큰 화면을 바라봐 주세요" : me.phase}</p>
      <p className={styles.dim}>
        {me.phase === "waiting" ? "첫 질문이 열리면 이곳에서 답할 수 있어요." : "응답을 모두 보냈어요."}
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
