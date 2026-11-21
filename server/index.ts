// Betta session server. Owns the session: stage, players, their inputs
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
  DECAY_PER_PLAYER,
  DEFAULT_ROOM,
  FILL_HOLD_MS,
  FILL_MS,
  GRID_MS,
  OPEN_MS,
  RELEASE_TIMEOUT_MS,
  TAPS_PER_PLAYER,
  STAGES,
  type AdminCommand,
  type ClientToServer,
  type FeedEvent,
  type Genome,
  type Phase,
  type ServerToClient,
  type SessionState,
  type Stage,
} from "../lib/protocol.ts";
import { genomeFromFeed } from "../lib/genome.ts";
import { createGridLayout } from "../lib/gridLayout.ts";

const PORT = Number(process.env.PORT) || 4000;
const ROOM = process.env.ROOM || DEFAULT_ROOM;
/** Unset = anyone on the screen route may send admin commands (fine on a local network). */
const ADMIN_KEY = process.env.ADMIN_KEY || "";
/** A disconnected player's betta fades and is removed after this long. */
const FADE_MS = 3 * 60_000;
const BROADCAST_MS = 100;
/** Grid stage auto-break; env override is for tests. */
const GRID_TIMEOUT_MS = Number(process.env.GRID_MS) || GRID_MS;
/** Comma-separated page origins allowed to connect, e.g. the Vercel URL. Unset = any. */
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean);

// ---------------------------------------------------------------- session

type Player = {
  id: string;
  socketId: string | null;
  lastSeen: number;
  phase: Phase;
  feed: FeedEvent[];
  feedDone: boolean;
  genome: Genome | null;
  /** Epoch ms the genome was made, for the release timeout. */
  genomeAt: number | null;
  released: boolean;
  slot: number | null;
  openUntil: number | null;
  effort: number;
};

const session = {
  stage: "lobby" as Stage,
  players: new Map<string, Player>(),
  effortTotal: 0,
  effortThreshold: 0,
  deadline: null as number | null,
  /** Player count the grid layout is built for; only grows during a round so cells keep their place. */
  gridSize: 0,
  fillAt: null as number | null,
};

/** Players who have a betta: the ones who can push walls and swim. */
const withGenome = () => [...session.players.values()].filter((p) => p.genome);

function newPlayer(id: string): Player {
  return {
    id,
    socketId: null,
    lastSeen: Date.now(),
    phase: "waiting",
    feed: [],
    feedDone: false,
    genome: null,
    genomeAt: null,
    released: false,
    slot: null,
    openUntil: null,
    effort: 0,
  };
}

function setGenome(player: Player, genome: Genome) {
  player.genome = genome;
  player.genomeAt = Date.now();
  // A late visitor who finishes while the tank is open swims in right away.
  if (session.stage === "open") player.openUntil = Date.now() + OPEN_MS;
}

/** Whether a released betta still gets a cell: before the placeholders start filling the grid. */
function seating() {
  return session.fillAt === null && (session.stage === "born" || session.stage === "input");
}

/** Players in the current round: the ones the grid waits for. */
function inRound(player: Player) {
  return session.stage === "input" ? player.phase === "input" : player.phase === "caged";
}

function gridCells() {
  return createGridLayout(Math.max(1, session.gridSize)).slots.length;
}

function release(player: Player) {
  if (!player.genome || player.released) return;
  player.released = true;
  if (!seating()) return;
  const round = [...session.players.values()].filter((p) => p.slot !== null || inRound(p)).length;
  session.gridSize = Math.max(session.gridSize, round);
  const taken = new Set([...session.players.values()].map((p) => p.slot));
  const free = Array.from({ length: gridCells() }, (_, i) => i).filter((i) => !taken.has(i));
  player.slot = free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

/** Everyone in the round has a seat: placeholders fill the rest, the full grid holds, then the walls go up. */
function startFill() {
  if (session.stage !== "born") setStage("born");
  session.fillAt = Date.now();
  session.deadline = session.fillAt + FILL_MS + FILL_HOLD_MS;
  console.log("grid filling");
  scheduleBroadcast();
}

function isDone(player: Player) {
  return player.feedDone;
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
  session.fillAt = null;
  if (stage === "input") session.gridSize = [...session.players.values()].filter((p) => p.socketId).length;

  for (const player of session.players.values()) {
    if (stage === "input") {
      player.slot = null;
      player.openUntil = null;
    }
    // Late arrivals keep scrolling their own feed as the room advances.
    if (stage !== "lobby" && player.phase === "input" && !player.genome) continue;
    if (player.phase !== "fading" || stage === "input") player.phase = phaseForStage(stage);
  }

  if (stage === "grid") {
    session.effortTotal = 0;
    session.effortThreshold = Math.max(1, withGenome().length) * TAPS_PER_PLAYER;
    session.deadline = Date.now() + GRID_TIMEOUT_MS;
    for (const player of session.players.values()) player.effort = 0;
  }
  if (stage === "open") {
    for (const player of session.players.values()) if (player.genome) player.openUntil = Date.now() + OPEN_MS;
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
  session.gridSize = 0;
  setStage("lobby");
}

function runAdmin(command: AdminCommand) {
  switch (command.cmd) {
    case "next": {
      // Born: start the placeholders now; during the fill or the hold, go straight to the walls.
      if (session.stage === "born") {
        if (session.fillAt === null) startFill();
        else setStage("grid");
        break;
      }
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
    case "prune":
      for (const [id, player] of session.players) if (!player.socketId) session.players.delete(id);
      scheduleBroadcast();
      break;
  }
}

function snapshot(): SessionState {
  return {
    room: ROOM,
    stage: session.stage,
    players: [...session.players.values()].map((p) => ({
      id: p.id,
      connected: p.socketId !== null,
      phase: p.phase,
      done: isDone(p),
      genome: p.genome,
      released: p.released,
      slot: p.slot,
      openUntil: p.openUntil,
      effort: p.effort,
    })),
    effort: { total: Math.round(session.effortTotal), threshold: session.effortThreshold },
    deadline: session.deadline,
    fillAt: session.fillAt,
    gridSize: Math.max(1, session.gridSize),
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

  socket.on("feed", ({ events, start, done }) => {
    const player = playerOf(socket);
    if (!player || player.feedDone || player.phase !== "input") return;
    if (start) player.feed = [];
    player.feed.push(...events.slice(0, 500));
    if (done) {
      player.feedDone = true;
      setGenome(player, genomeFromFeed(player.feed));
      console.log(`  genome ${player.id.slice(0, 6)} ${JSON.stringify(player.genome)}`);
    }
    scheduleBroadcast();
  });

  socket.on("effort", ({ amount }) => {
    const player = playerOf(socket);
    if (!player) return;
    if (session.stage !== "grid" || !player.genome) return;
    const taps = Math.min(3, Math.max(0, Math.round(amount)));
    player.effort += taps;
    session.effortTotal += taps;
    if (session.effortTotal >= session.effortThreshold) {
      console.log("walls down: together");
      setStage("open");
    }
    scheduleBroadcast();
  });

  socket.on("release", () => {
    const player = playerOf(socket);
    if (!player) return;
    release(player);
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
    if (!player.genome) {
      session.players.delete(player.id);
      console.log(`- phone ${player.id.slice(0, 6)} (dropped)`);
      scheduleBroadcast();
      return;
    }
    player.socketId = null;
    player.lastSeen = Date.now();
    if (session.stage === "open" && player.genome) player.phase = "fading";
    console.log(`- phone ${player.id.slice(0, 6)}`);
    scheduleBroadcast();
  });
});

// Grid stage: the shared push leaks away, and the walls come down on their own at the deadline.
const TICK_MS = 250;
setInterval(() => {
  if (seating()) {
    const now = Date.now();
    for (const player of session.players.values()) {
      if (player.genome && !player.released && player.genomeAt && now - player.genomeAt > RELEASE_TIMEOUT_MS) {
        release(player);
        scheduleBroadcast();
      }
    }
    const round = [...session.players.values()].filter((p) => p.socketId && inRound(p));
    if (round.length && round.every((p) => p.genome && p.released)) startFill();
  }
  if (session.stage === "born" && session.deadline && Date.now() >= session.deadline) {
    console.log("grid full: walls up");
    setStage("grid");
  }
  if (session.stage !== "grid") return;
  const pushing = withGenome().filter((p) => p.socketId).length;
  const leak = Math.max(1, pushing) * DECAY_PER_PLAYER * (TICK_MS / 1000);
  if (session.effortTotal > 0) {
    session.effortTotal = Math.max(0, session.effortTotal - leak);
    scheduleBroadcast();
  }
  if (session.deadline && Date.now() >= session.deadline) {
    console.log("walls down: timeout");
    setStage("open");
  }
}, TICK_MS);

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
