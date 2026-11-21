"use client";

import { useCallback, useEffect, useState } from "react";
import { useBetta } from "@/hooks/useBetta";
import { getPlayerId, shortTag } from "@/lib/playerId";
import type { FeedEvent, Hello, Steer } from "@/lib/protocol";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { BettaCard } from "./card/BettaCard";
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
  const cardDue = useAfter(me?.openUntil ?? null);

  if (rejected) return <Centered>{rejected}</Centered>;
  if (!connected || !me || !state) return <Centered dim>Connecting to the tank…</Centered>;

  if (me.phase === "input" && !me.done) {
    if (state.mode === "A") return <FakeFeed send={sendFeed} playerId={me.id} />;
    if (!me.question) return <Centered dim>Waiting for the question…</Centered>;
    return <QuestionDial
      playerId={me.id}
      question={me.question}
      onAnswer={(q, value) => socket.current?.emit("answer", { q, value })}
    />;
  }

  // Born, or Mode A as soon as this visitor's betta has grown: send it to the grid.
  if (me.genome && (state.stage === "born" || (state.stage === "input" && state.mode === "A"))) {
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

  if (state.stage === "open" && me.genome && cardDue) {
    return <BettaCard genome={me.genome} playerId={me.id} tag={shortTag(me.id)} />;
  }

  if (state.stage === "open" && me.genome) {
    return <Joystick genome={me.genome} playerId={me.id} tag={shortTag(me.id)} onSteer={sendSteer} />;
  }

  return (
    <Centered>
      <p className={styles.title}>{me.phase === "waiting" ? "You're in the water" : me.done ? "Look at the big screen" : me.phase}</p>
      <p className={styles.dim}>
        {me.phase !== "waiting"
          ? "All your answers are in."
          : state.mode === "A" ? "Your betta will start growing here soon." : "Answer here once the first question opens."}
      </p>
    </Centered>
  );
}

function Centered({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <main className={styles.root}>
      <WaterBackdrop />
      <div className={`${styles.message} ${dim ? styles.dim : ""}`}>{children}</div>
    </main>
  );
}

/** True once Date.now() passes `at` (epoch ms); re-renders at that moment. */
function useAfter(at: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    const wait = at - Date.now();
    if (wait <= 0) {
      setNow(Date.now());
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), wait + 50);
    return () => clearTimeout(timer);
  }, [at]);
  return at !== null && now >= at;
}
