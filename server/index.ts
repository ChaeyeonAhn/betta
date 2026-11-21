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
  DECAY_PER_PLAYER,
  DEFAULT_ROOM,
  GRID_MS,
  QUESTION_COUNT,
  TAPS_PER_PLAYER,
  STAGES,
  type AdminCommand,
  type ClientToServer,
  type FeedEvent,
  type Genome,
  type Mode,
  type Phase,
  type PlayerQuestion,
  type ServerToClient,
  type SessionState,
  type SharedQuestion,
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
const ANSWER_REVEAL_MS = 950;
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
  answers: (number | null)[];
  sharedInput: boolean;
  feed: FeedEvent[];
  feedDone: boolean;
  genome: Genome | null;
  released: boolean;
  effort: number;
};

const session = {
  stage: "lobby" as Stage,
  mode: "B" as Mode,
  players: new Map<string, Player>(),
  effortTotal: 0,
  effortThreshold: 0,
  deadline: null as number | null,
  questionIndex: null as number | null,
  questionAdvanceAt: null as number | null,
};

/** Players who have a betta: the ones who can push walls and swim. */
const withGenome = () => [...session.players.values()].filter((p) => p.genome);

function newPlayer(id: string): Player {
  return {
    id,
    socketId: null,
    lastSeen: Date.now(),
    phase: "waiting",
    answers: Array(QUESTION_COUNT).fill(null),
    sharedInput: false,
    feed: [],
    feedDone: false,
    genome: null,
    released: false,
    effort: 0,
  };
}

function isDone(player: Player) {
  return session.mode === "A" ? player.feedDone : player.genome !== null;
}

function sharedQuestion(): SharedQuestion | null {
  const index = session.questionIndex;
  if (index === null) return null;
  const group = [...session.players.values()].filter((player) => player.sharedInput && player.socketId);
  return { index, participants: group.length, answered: group.filter((player) => player.answers[index] !== null).length };
}

function currentQuestion(player: Player): PlayerQuestion | null {
  if (session.mode !== "B" || player.phase !== "input" || player.genome) return null;
  const index = player.sharedInput ? session.questionIndex : player.answers.indexOf(null);
  if (index === null || index < 0) return null;
  return { index, answered: player.answers[index] !== null, preview: genomeFromAnswers(player.answers) };
}

function nextQuestion() {
  const index = session.questionIndex;
  if (index === null) return;
  session.questionAdvanceAt = null;
  if (index + 1 >= QUESTION_COUNT) setStage("born");
  else {
    session.questionIndex = index + 1;
    scheduleBroadcast();
  }
}

/** Phase a player who is with the group should be in for the current stage. */
function phaseForStage(stage: Stage): Phase {
  if (stage === "lobby") return "waiting";
  if (stage === "input") return "input";
  if (stage === "open") return "free";
  return "caged";
}

function setStage(stage: Stage) {
  const wasQuestionnaire = session.questionIndex !== null;
  session.stage = stage;
  session.deadline = null;
  session.questionAdvanceAt = null;
  session.questionIndex = session.mode === "B" && stage === "input" ? 0 : null;

  for (const player of session.players.values()) {
    if (session.questionIndex !== null && player.socketId) {
      player.answers.fill(null);
      player.genome = null;
      player.released = false;
      player.sharedInput = true;
    } else if (wasQuestionnaire && player.sharedInput) {
      if (stage !== "lobby" && (player.socketId || player.answers.some((answer) => answer !== null))) {
        player.genome = genomeFromAnswers(player.answers);
      }
      player.sharedInput = false;
    } else if (stage !== "lobby" && player.phase === "input" && !player.genome) {
      // Late arrivals keep their personal questionnaire as the room advances.
      continue;
    }
    if (player.phase !== "fading" || stage === "input") player.phase = phaseForStage(stage);
  }

  if (stage === "grid") {
    session.effortTotal = 0;
    session.effortThreshold = Math.max(1, withGenome().length) * TAPS_PER_PLAYER;
    session.deadline = Date.now() + GRID_TIMEOUT_MS;
    for (const player of session.players.values()) player.effort = 0;
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
      if (session.stage !== "lobby" || (command.mode !== "A" && command.mode !== "B")) break;
      session.mode = command.mode;
      console.log(`mode → ${command.mode}`);
      scheduleBroadcast();
      break;
    case "next": {
      if (session.questionIndex !== null) {
        if (command.question === undefined || command.question === session.questionIndex) nextQuestion();
        break;
      }
      if (command.question !== undefined) break;
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
    mode: session.mode,
    players: [...session.players.values()].map((p) => ({
      id: p.id,
      connected: p.socketId !== null,
      phase: p.phase,
      done: isDone(p),
      genome: p.genome,
      released: p.released,
      effort: p.effort,
    })),
    effort: { total: Math.round(session.effortTotal), threshold: session.effortThreshold },
    deadline: session.deadline,
    question: sharedQuestion(),
  };
}

function snapshotForPhone(state: SessionState, player: Player): SessionState {
  const question = currentQuestion(player);
  if (!question) return state;
  return {
    ...state,
    players: state.players.map((view) => view.id === player.id ? { ...view, question } : view),
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
    const state = snapshot();
    for (const connection of io.sockets.sockets.values()) {
      const player = playerOf(connection);
      connection.emit("state", player ? snapshotForPhone(state, player) : state);
    }
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
    socket.emit("state", snapshotForPhone(snapshot(), player));
    scheduleBroadcast();
  });

  socket.on("admin", (command) => {
    if (socket.data.role !== "screen" || !socket.data.admin) return;
    runAdmin(command);
  });

  socket.on("answer", ({ q, value }) => {
    const player = playerOf(socket);
    if (!player || player.socketId !== socket.id || !Number.isInteger(value) || value < 0 || value > 10) return;
    const question = currentQuestion(player);
    if (!question || q !== question.index || question.answered) return;
    player.answers[q] = value;
    if (!player.sharedInput && q === QUESTION_COUNT - 1) {
      player.genome = genomeFromAnswers(player.answers);
      player.phase = phaseForStage(session.stage);
    }
    scheduleBroadcast();
  });

  socket.on("feed", ({ events, start, done }) => {
    const player = playerOf(socket);
    if (!player || player.feedDone || session.mode !== "A" || player.phase !== "input") return;
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
    if (!player || !player.genome || player.released) return;
    player.released = true;
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
    // Keep dial progress across reconnects, even before the betta is complete.
    const answering = session.mode === "B" && player.phase === "input";
    if (!player.genome && !answering) {
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
  const question = sharedQuestion();
  if (question) {
    if (question.participants > 0 && question.answered === question.participants) {
      session.questionAdvanceAt ??= Date.now() + ANSWER_REVEAL_MS;
      if (Date.now() >= session.questionAdvanceAt) nextQuestion();
    } else {
      session.questionAdvanceAt = null;
    }
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
