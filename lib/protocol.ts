// Shared between server/index.ts (Node, type stripping) and the Next.js pages.
// Only erasable TypeScript here: no enums, no namespaces, no parameter properties.

export const STAGES = ["lobby", "input", "born", "grid", "open"] as const;
export type Stage = (typeof STAGES)[number];

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
  /** Finished the 45s feed. */
  done: boolean;
  genome: Genome | null;
  /** Born stage: the visitor pushed their betta from the phone into the tank. */
  released: boolean;
  /** Grid cell this betta was given on release (index into createGridLayout().slots). Null = arrived late, enters open from an edge. */
  slot: number | null;
  /** Open stage: epoch ms when this visitor's time with the joystick ends and their betta card appears. */
  openUntil: number | null;
  /** Grid stage: taps this player put into their own wall. */
  effort: number;
};

export type SessionState = {
  room: string;
  stage: Stage;
  players: PlayerView[];
  effort: { total: number; threshold: number };
  /** Epoch ms when the current timed stage auto-advances, or null. */
  deadline: number | null;
  /** Born stage: epoch ms when placeholder bettas started filling the empty cells, or null. */
  fillAt: number | null;
  /** Player count the grid layout is built for: createGridLayout(gridSize). */
  gridSize: number;
};

export type Hello =
  | { role: "phone"; room: string; playerId: string }
  | { role: "screen"; room: string; adminKey?: string };

export type AdminCommand =
  | { cmd: "next" }
  | { cmd: "goto"; stage: Stage }
  | { cmd: "reset" }
  /** Drop every player whose phone is disconnected, right now. */
  | { cmd: "prune" };

export type Steer = { x: number; y: number };

export type ClientToServer = {
  hello: (hello: Hello) => void;
  admin: (command: AdminCommand) => void;
  /** `start` clears earlier events (feed restarted after a reload); `done` = the 45s are over. */
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

export const FEED_MS = 45_000;

/** Grid stage: walls break when the room's taps reach players × TAPS_PER_PLAYER, or after GRID_MS. */
export const GRID_MS = 60_000;
export const TAPS_PER_PLAYER = 30;
/** The shared total leaks this many taps per second per player, so everyone has to keep pushing. */
export const DECAY_PER_PLAYER = 2;
export const DEFAULT_ROOM = "betta";

/**
 * Born stage: once every visitor's betta is in, placeholder bettas fade in
 * with their cubes, front row first and then the rows behind, over FILL_MS.
 * The full grid then holds for FILL_HOLD_MS before the walls go up.
 */
export const FILL_MS = 14_000;
export const FILL_HOLD_MS = 20_000;
/** A betta with a genome that hasn't been released after this long is released for the visitor. */
export const RELEASE_TIMEOUT_MS = 30_000;
/** Open stage: each visitor steers for this long, then gets their betta card. */
export const OPEN_MS = 90_000;
