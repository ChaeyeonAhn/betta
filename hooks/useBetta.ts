"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServer, Hello, ServerToClient, SessionState } from "@/lib/protocol";

export type BettaSocket = Socket<ServerToClient, ClientToServer>;

/**
 * Connects to server/index.ts, says hello on every (re)connect and keeps the
 * latest session state. `url` comes from the page (SOCKET_URL env); without it
 * the server is assumed on the same host, port 4000. `socket` is null until mounted.
 */
export function useBetta(hello: Hello | null, url: string | null = null) {
  const [state, setState] = useState<SessionState | null>(null);
  const [connected, setConnected] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [rejected, setRejected] = useState<string | null>(null);
  const socketRef = useRef<BettaSocket | null>(null);
  const helloKey = hello ? JSON.stringify(hello) : null;

  useEffect(() => {
    if (!helloKey) return;
    const socket: BettaSocket = io(url ?? `${window.location.protocol}//${window.location.hostname}:4000`);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("hello", JSON.parse(helloKey) as Hello);
    });
    socket.on("disconnect", () => setConnected(false));
    let hasClockSample = false;
    socket.on("state", (snapshot) => {
      if (!hasClockSample) {
        // Anchor once per socket lifetime so incoming state and reconnects do
        // not move an active feed's deadline when network latency varies.
        setClockOffset(snapshot.serverNow - Date.now());
        hasClockSample = true;
      }
      setState(snapshot);
    });
    socket.on("rejected", ({ reason }) => setRejected(reason));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [helloKey, url]);

  return { state, clockOffset, connected, rejected, socket: socketRef };
}
