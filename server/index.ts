// Betta session server. Owns the session: stage, players, their inputs
// and genomes, the shared wall-breaking effort, and timers. The screen owns
// the simulation; steering input is only relayed to it.
//
// Run with Node 24 type stripping: `node server/index.ts` (`--https` reuses
// the certificates `next dev --experimental-https` generates).

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer as createHttpServer, type RequestListener } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { Server, type Socket } from "socket.io";
import { lanAddresses } from "../lib/lan.ts";
import {
  DECAY_PER_PLAYER,
  DEFAULT_ROOM,
  FILL_HOLD_MS,
  FEED_MS,
  GRID_MS,
  OPEN_MS,
  TAPS_PER_PLAYER,
  STAGES,
  type AdminCommand,
  type ClientToServer,
  type FeedEvent,
  type Genome,
  type Phase,
  type ReactionKind,
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
/** Let the final in-flight batch land without extending the creation clock. */
const FEED_GRACE_MS = 750;
const MAX_FEED_EVENTS = 10_000;
/** Reconnect backlog still scores, but only current gestures animate. */
const REACTION_FRESH_MS = 1500;
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
  feedStartedAt: number | null;
  feedIds: Set<string>;
  genome: Genome | null;
  released: boolean;
  slot: number | null;
  openUntil: number | null;
  effort: number;
};

const session = {
  roundId: randomUUID(),
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
    feedStartedAt: null,
    feedIds: new Set(),
    genome: null,
    released: false,
    slot: null,
    openUntil: null,
    effort: 0,
  };
}

function setGenome(player: Player, genome: Genome) {
  player.genome = genome;
  // A late visitor who finishes while the tank is open swims in right away.
  if (session.stage === "open") player.openUntil = Date.now() + OPEN_MS;
}

/** Reserve once, before the visitor presses OK; slots survive reconnects. */
function reserveSeat(player: Player) {
  if (player.slot !== null || (session.stage !== "input" && session.stage !== "born")) return;
  const seated = [...session.players.values()].filter((p) => p.slot !== null).length;
  session.gridSize = Math.max(session.gridSize, seated + 1);
  const taken = new Set([...session.players.values()].map((p) => p.slot));
  const free = createGridLayout(Math.max(1, session.gridSize)).slots
    .map((_, index) => index).filter((index) => !taken.has(index));
  player.slot = free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function release(player: Player) {
  if (!player.genome || player.released) return;
  player.released = true;
  reserveSeat(player);
}

function finishFeed(player: Player) {
  if (player.feedDone) return;
  player.feedDone = true;
  setGenome(player, genomeFromFeed(player.feed));
  release(player);
  player.phase = session.stage === "open" ? "free" : "caged";
  scheduleBroadcast();
}

const reactionFor: Partial<Record<FeedEvent["kind"], ReactionKind>> = {
  like: "heart", tap: "happy", accept: "happy", decline: "mad",
  reply: "message", post: "share", close: "serious", ignore: "sad",
};

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
  if (stage === "input") session.gridSize = Math.max(session.gridSize, session.players.size);
  // Hold the completed adults without manufacturing filler fish or a zoom-out.
  if (stage === "born") session.deadline = Date.now() + FILL_HOLD_MS;

  for (const player of session.players.values()) {
    if (stage === "input") {
      reserveSeat(player);
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
  session.roundId = randomUUID();
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
    roundId: session.roundId,
    serverNow: Date.now(),
    room: ROOM,
    stage: session.stage,
    players: [...session.players.values()].map((p) => ({
      id: p.id,
      connected: p.socketId !== null,
      phase: p.phase,
      done: isDone(p),
      feedStartedAt: p.feedStartedAt,
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
  const player = id ? session.players.get(id) : undefined;
  return player?.socketId === socket.id ? player : undefined;
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
    reserveSeat(player);
    socket.emit("state", snapshot());
    scheduleBroadcast();
  });

  socket.on("admin", (command) => {
    if (socket.data.role !== "screen" || !socket.data.admin) return;
    runAdmin(command);
  });

  socket.on("feed", ({ roundId, events, start, done }) => {
    const player = playerOf(socket);
    if (roundId !== session.roundId || !player || player.feedDone || player.phase !== "input") return;
    const now = Date.now();
    if (start && player.feedStartedAt === null) player.feedStartedAt = now;
    if (player.feedStartedAt === null) return;
    const elapsed = now - player.feedStartedAt;
    if (elapsed > FEED_MS + FEED_GRACE_MS) {
      finishFeed(player);
      return;
    }
    for (const event of (Array.isArray(events) ? events : []).slice(0, 500)) {
      if (!event || !Number.isFinite(event.t) || event.t < 0 || event.t > FEED_MS
        || event.t > elapsed + 1000 || !["dwell", "tap", "ignore", "like", "accept", "decline", "reply", "close", "post"].includes(event.kind)
        || !["brag", "mood", "friend", "stranger", "self"].includes(event.tag)
        || (event.ms !== undefined && (!Number.isFinite(event.ms) || event.ms < 0 || event.ms > FEED_MS))
        || (event.hue !== undefined && (!Number.isFinite(event.hue) || event.hue < 0 || event.hue > 1))) continue;
      const id = event.id ?? JSON.stringify([event.kind, event.tag, event.t, event.ms, event.hue]);
      if (player.feedIds.has(id) || player.feed.length >= MAX_FEED_EVENTS) continue;
      player.feedIds.add(id);
      player.feed.push(event);
      const kind = reactionFor[event.kind];
      if (event.intent === true && kind && elapsed - event.t <= REACTION_FRESH_MS) {
        io.to("screens").emit("reaction", { roundId: session.roundId, playerId: player.id, kind });
      }
    }
    if (done && elapsed >= FEED_MS) finishFeed(player);
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
    const player = playerOf(socket);
    if (!player || !player.genome) return;
    io.to("screens").emit("steer", { ...steer, playerId: player.id });
  });

  socket.on("disconnect", () => {
    const player = playerOf(socket);
    if (!player || player.socketId !== socket.id) return;
    if (session.stage === "lobby" && player.phase === "waiting" && player.slot === null
      && player.feedStartedAt === null && !player.genome) {
      session.players.delete(player.id);
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
  const now = Date.now();
  for (const player of session.players.values()) {
    if (!player.feedDone && player.feedStartedAt !== null && now >= player.feedStartedAt + FEED_MS + FEED_GRACE_MS) {
      finishFeed(player);
    }
  }
  if (session.stage === "input") {
    const active = [...session.players.values()].filter((player) => player.socketId);
    if (active.length && active.every((player) => player.feedDone)) setStage("born");
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
