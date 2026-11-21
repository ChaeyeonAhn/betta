// Shared between server/index.ts (Node, type stripping) and the Next.js pages.
// Only erasable TypeScript here: no enums, no namespaces, no parameter properties.

import { SNS_QUESTIONS } from "./questions.ts";

export const STAGES = ["lobby", "input", "born", "grid", "open"] as const;
export type Stage = (typeof STAGES)[number];

/** A = 30s SNS feed, B = 0–10 dial pad questions. */
export type Mode = "A" | "B";

/**
 * Where one player is. Late joiners can complete their input independently.
 */
export type Phase = "waiting" | "input" | "caged" | "free" | "fading";

export type Genome = {
  hue: number; // 0–1 body colour, cool → warm
  saturation: number; // 0–1 how ornate (selectively bred)
  finLength: number; // 0–1 wanting to be seen
  boundary: number; // 0–1 personal space radius
  sociability: number; // 0–1 schooling tendency
  markings?: number; // 0–1 selection across the markings
  reactivity?: number; // 0–1 changes in fin rhythm and turning
  glide?: number; // 0–1 local swimming range
};

export type PlayerQuestion = {
  index: number;
  answered: boolean;
  preview: Genome;
};

export type SharedQuestion = {
  index: number;
  answered: number;
  participants: number;
};

/** What a post or notification is about. Each tag feeds one or two genome axes (lib/genome.ts). */
export type FeedTag = "brag" | "mood" | "friend" | "stranger" | "self";

export type FeedEvent = {
  /**
   * dwell   a post was on screen (ms)        tap      a banner was opened
   * ignore  a banner timed out or was swiped like     ♡ on a post or card
   * accept / decline  a stranger's request    reply    answered a friend
   * close   closed a card without reacting    post     pressed "+ Post"
   */
  kind: "dwell" | "tap" | "ignore" | "like" | "accept" | "decline" | "reply" | "close" | "post";
  tag: FeedTag;
  /** ms since the feed started. */
  t: number;
  /** ms spent, for dwell. */
  ms?: number;
  /** 0–1 hue of the post, for dwell on mood posts. */
  hue?: number;
};

export type PlayerView = {
  id: string;
  connected: boolean;
  phase: Phase;
  /** Finished the input of the current mode. */
  done: boolean;
  genome: Genome | null;
  /** Born stage: the visitor pushed their betta from the phone into the tank. */
  released: boolean;
  /** Grid stage: taps this player put into their own wall. */
  effort: number;
  question?: PlayerQuestion | null;
};

export type SessionState = {
  room: string;
  stage: Stage;
  mode: Mode;
  players: PlayerView[];
  effort: { total: number; threshold: number };
  /** Epoch ms when the current timed stage auto-advances, or null. */
  deadline: number | null;
  question?: SharedQuestion | null;
};

export type Hello =
  | { role: "phone"; room: string; playerId: string }
  | { role: "screen"; room: string; adminKey?: string };

export type AdminCommand =
  | { cmd: "setMode"; mode: Mode }
  | { cmd: "next"; question?: number }
  | { cmd: "goto"; stage: Stage }
  | { cmd: "reset" }
  /** Drop every player whose phone is disconnected, right now. */
  | { cmd: "prune" };

export type Steer = { x: number; y: number };

export type ClientToServer = {
  hello: (hello: Hello) => void;
  admin: (command: AdminCommand) => void;
  answer: (answer: { q: number; value: number }) => void;
  /** `start` clears earlier events (feed restarted after a reload); `done` = the 30s are over. */
  feed: (batch: { events: FeedEvent[]; start?: boolean; done?: boolean }) => void;
  effort: (effort: { amount: number }) => void;
  /** Born stage: send my betta from the phone to the screen. */
  release: () => void;
  steer: (steer: Steer) => void;
};

export type ServerToClient = {
  state: (state: SessionState) => void;
  steer: (steer: Steer & { playerId: string }) => void;
  rejected: (reason: { reason: string }) => void;
};

export const QUESTION_COUNT = SNS_QUESTIONS.length;
export const FEED_MS = 30_000;

/** Grid stage: walls break when the room's taps reach players × TAPS_PER_PLAYER, or after GRID_MS. */
export const GRID_MS = 60_000;
export const TAPS_PER_PLAYER = 30;
/** The shared total leaks this many taps per second per player, so everyone has to keep pushing. */
export const DECAY_PER_PLAYER = 2;
export const DEFAULT_ROOM = "betta";
