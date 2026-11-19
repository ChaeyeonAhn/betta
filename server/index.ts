// Betta session server. Owns the session: stage, mode, players, their inputs
// and genomes, the shared wall-breaking effort, and timers. The screen owns
// the simulation; steering input is only relayed to it.
//
// Run with Node 24 type stripping: `node server/index.ts` (`--https` reuses
// the certificates `next dev --experimental-https` generates).

import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpServer, type RequestListener } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { Server, type Socket } from "socket.io";
import { lanAddresses } from "../lib/lan.ts";
import {
  DEFAULT_ROOM,
  QUESTION_COUNT,
  STAGES,
  type AdminCommand,
  type ClientToServer,
  type FeedEvent,
  type Genome,
  type Mode,
  type Phase,
  type ServerToClient,
  type SessionState,
  type Stage,
} from "../lib/protocol.ts";
import { genomeFromAnswers, genomeFromFeed } from "../lib/genome.ts";

const PORT = Number(process.env.PORT) || 4000;
const ROOM = process.env.ROOM || DEFAULT_ROOM;
/** Unset = anyone on the screen route may send admin commands (fine on a local network). */
const ADMIN_KEY = process.env.ADMIN_KEY || "";
/** A disconnected player's betta fades and is removed after this long. */
const FADE_MS = 3 * 60_000;
const BROADCAST_MS = 100;
/** Comma-separated page origins allowed to connect, e.g. the Vercel URL. Unset = any. */
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);

// ---------------------------------------------------------------- session

type Player = {
  id: string;
  socketId: string | null;
  lastSeen: number;
  phase: Phase;
  answers: (number | null)[];
  feed: FeedEvent[];
  feedDone: boolean;
  genome: Genome | null;
  effort: number;
};

const session = {
  stage: "lobby" as Stage,
  mode: "A" as Mode,
  players: new Map<string, Player>(),
  effortTotal: 0,
  deadline: null as number | null,
};

function newPlayer(id: string): Player {
  return {
    id,
    socketId: null,
    lastSeen: Date.now(),
    phase: "waiting",
    answers: Array(QUESTION_COUNT).fill(null),
    feed: [],
    feedDone: false,
    genome: null,
    effort: 0,
  };
}

function isDone(player: Player) {
  // A = 30s feed, B = five dial pad answers.
  return session.mode === "A" ? player.feedDone : player.answers.every((a) => a !== null);
}

/** Phase a player who is with the group should be in for the current stage. */
function phaseForStage(stage: Stage): Phase {
  if (stage === "lobby") return "waiting";
  if (stage === "input") return "input";
  if (stage === "open") return "free";
  return "caged";
}

function setStage(stage: Stage) {
  session.stage = stage;
  session.deadline = null;
  if (stage === "grid") session.effortTotal = 0;
  for (const player of session.players.values()) {
    if (player.phase !== "fading") player.phase = phaseForStage(stage);
  }
  console.log(`stage → ${stage}`);
  scheduleBroadcast();
}

function reset() {
  // Keep who is connected, clear everything they did.
  for (const [id, player] of session.players) {
    if (!player.socketId) session.players.delete(id);
    else session.players.set(id, { ...newPlayer(id), socketId: player.socketId });
  }
  session.effortTotal = 0;
  setStage("lobby");
}

function runAdmin(command: AdminCommand) {
  switch (command.cmd) {
    case "setMode":
      session.mode = command.mode;
      console.log(`mode → ${command.mode}`);
      scheduleBroadcast();
      break;
    case "next": {
      const index = STAGES.indexOf(session.stage);
      if (index < STAGES.length - 1) setStage(STAGES[index + 1]);
      break;
    }
    case "goto":
      if (STAGES.includes(command.stage)) setStage(command.stage);
      break;
    case "reset":
      reset();
      break;
  }
}

function snapshot(): SessionState {
  return {
    room: ROOM,
    stage: session.stage,
    mode: session.mode,
    players: [...session.players.values()].map((p) => ({
      id: p.id,
      connected: p.socketId !== null,
      phase: p.phase,
      done: isDone(p),
      genome: p.genome,
    })),
    effort: { total: session.effortTotal, threshold: 0 },
    deadline: session.deadline,
  };
}

// ---------------------------------------------------------------- transport

const keyPath = "certificates/localhost-key.pem";
const certPath = "certificates/localhost.pem";

// In `pnpm dev:mobile` Next may still be generating the certificates.
async function waitForCertificates(ms = 20_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (existsSync(keyPath) && existsSync(certPath)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const handler: RequestListener = (_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("betta server ok\n");
};

const secure = process.argv.includes("--https") && (await waitForCertificates());
const httpServer = secure
  ? createHttpsServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, handler)
  : createHttpServer(handler);

type Data = { role?: "phone" | "screen"; playerId?: string; admin?: boolean };
const io = new Server<ClientToServer, ServerToClient, Record<string, never>, Data>(httpServer, {
  cors: { origin: ALLOWED_ORIGINS?.length ? ALLOWED_ORIGINS : "*" },
});

let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBroadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    io.emit("state", snapshot());
  }, BROADCAST_MS);
}

function playerOf(socket: Socket<ClientToServer, ServerToClient, Record<string, never>, Data>) {
  const id = socket.data.playerId;
  return id ? session.players.get(id) : undefined;
}

io.on("connection", (socket) => {
  socket.on("hello", (hello) => {
    if (hello.room !== ROOM) {
      socket.emit("rejected", { reason: `unknown room "${hello.room}"` });
      socket.disconnect(true);
      return;
    }

    if (hello.role === "screen") {
      socket.data.role = "screen";
      socket.data.admin = !ADMIN_KEY || hello.adminKey === ADMIN_KEY;
      socket.join("screens");
      socket.emit("state", snapshot());
      return;
    }

    socket.data.role = "phone";
    socket.data.playerId = hello.playerId;
    let player = session.players.get(hello.playerId);
    if (!player) {
      player = newPlayer(hello.playerId);
      // Joining after the group input has started: do the input alone.
      player.phase = session.stage === "lobby" ? "waiting" : "input";
      session.players.set(player.id, player);
      console.log(`+ phone ${player.id.slice(0, 6)} (${session.players.size})`);
    } else if (player.phase === "fading") {
      player.phase = phaseForStage(session.stage);
    }
    player.socketId = socket.id;
    player.lastSeen = Date.now();
    socket.emit("state", snapshot());
    scheduleBroadcast();
  });

  socket.on("admin", (command) => {
    if (socket.data.role !== "screen" || !socket.data.admin) return;
    runAdmin(command);
  });

  socket.on("answer", ({ q, value }) => {
    const player = playerOf(socket);
    if (!player || q < 0 || q >= QUESTION_COUNT) return;
    player.answers[q] = Math.min(10, Math.max(1, Math.round(value)));
    if (player.answers.every((a) => a !== null)) player.genome = genomeFromAnswers(player.answers as number[]);
    scheduleBroadcast();
  });

  socket.on("feed", ({ events, start, done }) => {
    const player = playerOf(socket);
    if (!player || player.feedDone) return;
    if (start) player.feed = [];
    player.feed.push(...events.slice(0, 500));
    if (done) {
      player.feedDone = true;
      player.genome = genomeFromFeed(player.feed);
      console.log(`  genome ${player.id.slice(0, 6)} ${JSON.stringify(player.genome)}`);
    }
    scheduleBroadcast();
  });

  socket.on("effort", ({ amount }) => {
    const player = playerOf(socket);
    if (!player) return;
    // TODO(11/22): decay, threshold, auto-break, deadline.
    player.effort += amount;
    session.effortTotal += amount;
    scheduleBroadcast();
  });

  socket.on("steer", (steer) => {
    const id = socket.data.playerId;
    if (!id) return;
    io.to("screens").emit("steer", { ...steer, playerId: id });
  });

  socket.on("disconnect", () => {
    const player = playerOf(socket);
    if (!player || player.socketId !== socket.id) return;
    player.socketId = null;
    player.lastSeen = Date.now();
    if (session.stage === "open") player.phase = "fading";
    console.log(`- phone ${player.id.slice(0, 6)}`);
    scheduleBroadcast();
  });
});

// Remove bettas whose phones have been gone for a while.
setInterval(() => {
  const now = Date.now();
  for (const [id, player] of session.players) {
    if (!player.socketId && now - player.lastSeen > FADE_MS) {
      session.players.delete(id);
      scheduleBroadcast();
    }
  }
}, 10_000);

httpServer.listen(PORT, "0.0.0.0", () => {
  const protocol = secure ? "https" : "http";
  console.log(`betta server on ${protocol}://localhost:${PORT}  room="${ROOM}"  admin=${ADMIN_KEY ? "key" : "open"}`);
  for (const address of lanAddresses()) console.log(`  lan: ${protocol}://${address}:${PORT}`);
  if (process.env.SOCKET_URL) console.log(`  tunnel: ${process.env.SOCKET_URL}`);
});
