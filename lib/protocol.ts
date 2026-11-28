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

export type ReactionKind = "heart" | "happy" | "mad" | "message" | "share" | "serious" | "sad";
export type Reaction = { roundId: string; playerId: string; kind: ReactionKind };

export type FeedEvent = {
  /** Stable across retries; newly generated for every observation or gesture. */
  id?: string;
  /** Only a deliberate gesture produces a projection reaction. */
  intent?: boolean;
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
  /** Server epoch at the first accepted OK/start; retained on reconnect. */
  feedStartedAt: number | null;
  genome: Genome | null;
  /** The server completed creation and put the adult into the shared tank. */
  released: boolean;
  /** Reserved before OK in input/born; stable through reconnect. Null = late grid/open arrival. */
  slot: number | null;
  /** Open stage: epoch ms when this visitor's time with the joystick ends and their betta card appears. */
  openUntil: number | null;
  /** Grid stage: taps on this player's cell, from them and from anyone helping. */
  effort: number;
  /** Grid stage: this player's cell is broken and their betta is out. */
  broken: boolean;
  /** Grid stage, once out (or without a cell): the slot whose glass their taps go to. */
  helping: number | null;
};

export type SessionState = {
  roundId: string;
  /** Snapshot epoch for phone clock-offset estimation. */
  serverNow: number;
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

export type FeedBatch = { roundId: string; events: FeedEvent[]; start?: boolean; done?: boolean };

export type ClientToServer = {
  hello: (hello: Hello) => void;
  admin: (command: AdminCommand) => void;
  /** Start is idempotent; done is accepted only once the server's 45s has elapsed. */
  feed: (batch: FeedBatch) => void;
  effort: (effort: { amount: number }) => void;
  /** Grid stage, once out: tap this cell's glass instead (must be a cell still closed). */
  help: (help: { slot: number }) => void;
  /** Born stage: send my betta from the phone to the screen. */
  release: () => void;
  steer: (steer: Steer) => void;
};

export type ServerToClient = {
  state: (state: SessionState) => void;
  reaction: (reaction: Reaction) => void;
  steer: (steer: Steer & { playerId: string }) => void;
  rejected: (reason: { reason: string }) => void;
};

export const FEED_MS = 45_000;

/**
 * Grid stage: each cell breaks on its own at TAPS_PER_PLAYER taps (its owner's
 * and its helpers'); the tank opens when the last one breaks, or after GRID_MS.
 */
export const GRID_MS = 60_000;
export const TAPS_PER_PLAYER = 30;
export const DEFAULT_ROOM = "betta";

/**
 * Born stage: once every visitor's betta is grown, the camera pulls back while
 * placeholder bettas fill every other cell over FILL_MS; the full grid holds
 * for FILL_HOLD_MS, then the camera comes back in for the walls.
 */
export const FILL_MS = 14_000;
export const FILL_HOLD_MS = 8_000;
/** A betta with a genome that hasn't been released after this long is released for the visitor. */
export const RELEASE_TIMEOUT_MS = 30_000;
/** Open stage: each visitor steers for this long, then gets their betta card. */
export const OPEN_MS = 90_000;
