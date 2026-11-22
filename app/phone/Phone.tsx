"use client";

import { useCallback, useEffect, useState } from "react";
import { useBetta } from "@/hooks/useBetta";
import { getPlayerId, shortTag } from "@/lib/playerId";
import type { FeedEvent, Hello, Steer } from "@/lib/protocol";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { unlockAudio } from "@/app/_components/sound";
import { BettaCard } from "./card/BettaCard";
import { Joystick } from "./controls/Joystick";
import { FakeFeed } from "./modes/FakeFeed";
import { Release } from "./Release";
import { LookAround } from "./LookAround";
import { Cell } from "./Cell";
import styles from "./phone.module.css";

export function Phone({ room, socketUrl }: { room: string; socketUrl: string | null }) {
  // The id lives in localStorage, so it can only be read after mount.
  const [hello, setHello] = useState<Hello | null>(null);
  useEffect(() => setHello({ role: "phone", room, playerId: getPlayerId() }), [room]);
  // Taps in the feed and the release swipe unlock audio before the cell needs it.
  useEffect(unlockAudio, []);

  const { state, connected, rejected, socket } = useBetta(hello, socketUrl);
  const me = state?.players.find((p) => hello?.role === "phone" && p.id === hello.playerId);

  const sendFeed = useCallback(
    (batch: { events: FeedEvent[]; start?: boolean; done?: boolean }) => socket.current?.emit("feed", batch),
    [socket],
  );
  const sendSteer = useCallback((steer: Steer) => socket.current?.emit("steer", steer), [socket]);
  const cardDue = useAfter(me?.openUntil ?? null);
  // A swipe on this phone plays the fish flying off before the phone becomes its cell.
  const [flight, setFlight] = useState<"none" | "flying" | "landed">("none");

  if (rejected) return <Centered>{rejected}</Centered>;
  if (!connected || !me || !state) return <Centered dim>Connecting to the tank…</Centered>;

  if (me.phase === "input" && !me.done) return <FakeFeed send={sendFeed} playerId={me.id} />;

  // Once the betta has grown, until the walls break: release it, then be it,
  // inside its cell. Late arrivals without a cell just look around.
  const caged = state.stage === "born" || state.stage === "grid" || state.stage === "input";
  if (caged && me.genome) {
    if (me.released && me.slot !== null && flight !== "flying") {
      return <Cell state={state} me={me} slot={me.slot} onPush={() => socket.current?.emit("effort", { amount: 1 })} />;
    }
    if (state.stage !== "grid" && (!me.released || flight === "flying")) {
      return (
        <Release
          genome={me.genome}
          playerId={me.id}
          released={me.released}
          onRelease={() => {
            setFlight("flying");
            socket.current?.emit("release");
          }}
          onGone={() => setFlight("landed")}
        />
      );
    }
    return <LookAround />;
  }

  if (state.stage === "open" && me.genome && cardDue) {
    return <BettaCard genome={me.genome} playerId={me.id} name={shortTag(me.id).slice(1)} />;
  }

  if (state.stage === "open" && me.genome) {
    return <Joystick onSteer={sendSteer} />;
  }

  // The lobby, and any moment in between: just the water to look around in.
  return <LookAround />;
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
