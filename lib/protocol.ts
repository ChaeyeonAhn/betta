// Shared between server/index.ts (Node, type stripping) and the Next.js pages.
// Only erasable TypeScript here: no enums, no namespaces, no parameter properties.

export const STAGES = ["lobby", "input", "born", "grid", "open"] as const;
export type Stage = (typeof STAGES)[number];

/** A = 1–10 dial pad questions, B = fake SNS feed. Set per session. */
export type Mode = "A" | "B";

/**
 * Where one player is. Mostly follows the stage, but a late joiner during
 * `open` walks through input → caged → free on their own.
 */
export type Phase = "waiting" | "input" | "caged" | "free" | "fading";

export type Genome = {
  hue: number; // 0–1 body colour, cool → warm
  saturation: number; // 0–1 how ornate (selectively bred)
  finLength: number; // 0–1 wanting to be seen
  boundary: number; // 0–1 personal space radius
  sociability: number; // 0–1 schooling tendency
};

export type FeedEvent = {
  kind: "tap" | "ignore" | "like" | "dwell" | "post";
  /** Axis tag of the post/notification, e.g. "brag", "stranger", "friend", "mood". */
  tag: string;
  /** ms since the feed started. */
  t: number;
  /** ms spent, for dwell. */
  ms?: number;
};

export type PlayerView = {
  id: string;
  connected: boolean;
  phase: Phase;
  /** Finished the input of the current mode. */
  done: boolean;
  genome: Genome | null;
};

export type SessionState = {
  room: string;
  stage: Stage;
  mode: Mode;
  players: PlayerView[];
  effort: { total: number; threshold: number };
  /** Epoch ms when the current timed stage auto-advances, or null. */
  deadline: number | null;
};

export type Hello =
  | { role: "phone"; room: string; playerId: string }
  | { role: "screen"; room: string; adminKey?: string };

export type AdminCommand =
  | { cmd: "setMode"; mode: Mode }
  | { cmd: "next" }
  | { cmd: "goto"; stage: Stage }
  | { cmd: "reset" };

export type Steer = { x: number; y: number };

export type ClientToServer = {
  hello: (hello: Hello) => void;
  admin: (command: AdminCommand) => void;
  answer: (answer: { q: number; value: number }) => void;
  feed: (batch: { events: FeedEvent[] }) => void;
  effort: (effort: { amount: number }) => void;
  steer: (steer: Steer) => void;
};

export type ServerToClient = {
  state: (state: SessionState) => void;
  steer: (steer: Steer & { playerId: string }) => void;
  rejected: (reason: { reason: string }) => void;
};

export const QUESTION_COUNT = 5;
export const DEFAULT_ROOM = "betta";
