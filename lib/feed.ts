// Feed content: the posts in the fake feed and the notifications that fall
// over it during the 45 seconds. The app has no name on screen.
// Copy is placeholder and up for review (docs/plan.md §7).

import type { FeedTag } from "./protocol.ts";

export type Post = {
  id: string;
  tag: FeedTag;
  author: string;
  text: string;
  /** 0–1, tints the image block; mood posts carry the hue axis. */
  hue: number;
};

export type CardAction = "like" | "accept" | "decline" | "reply";

/**
 * A banner. Tapping it is the whole interaction for news about you (likes,
 * views, followers): those have no card. Only notices that ask something of
 * you open a card with the replies that make sense: a message → Reply, a
 * request → Accept / Decline, a friend's new post → its picture and ♡.
 */
export type Notice = {
  id: string;
  tag: FeedTag;
  /** Banner line. */
  text: string;
  card?: {
    title: string;
    body: string;
    actions: CardAction[];
    /** Button words when the default ones don't fit (e.g. Join for a call). */
    labels?: Partial<Record<CardAction, string>>;
    /** A post: show its picture frame. */
    photo?: boolean;
  };
};

export const POSTS: Post[] = [
  { id: "p1", tag: "brag", author: "hana", text: "Lisbon, finally. Grateful for everything.", hue: 0.08 },
  { id: "p2", tag: "mood", author: "jiwoo", text: "Rainy Sunday. Not going anywhere.", hue: 0.6 },
  { id: "p3", tag: "friend", author: "minseo", text: "Movie night at mine on Friday?", hue: 0.33 },
  { id: "p4", tag: "brag", author: "daniel", text: "New PR this morning. 5am club.", hue: 0.02 },
  { id: "p5", tag: "mood", author: "seoyeon", text: "Sunset walk by the lake.", hue: 0.95 },
  { id: "p6", tag: "brag", author: "yuna", text: "Can't believe this is my office today.", hue: 0.14 },
  { id: "p7", tag: "mood", author: "taeho", text: "3am. Still awake.", hue: 0.7 },
  { id: "p8", tag: "friend", author: "dorm 3F", text: "Who took my oat milk", hue: 0.45 },
];

const follow = { labels: { accept: "Confirm", decline: "Delete" } } as const;

export const NOTICES: Notice[] = [
  { id: "n1", tag: "friend", text: "jiwoo: are you coming tonight?", card: { title: "jiwoo", body: "are you coming tonight?", actions: ["reply"] } },
  { id: "n2", tag: "self", text: "3 people liked your post" },
  { id: "n3", tag: "stranger", text: "user_8841 requested to follow you", card: { title: "user_8841", body: "0 mutual friends", actions: ["accept", "decline"], ...follow } },
  { id: "n4", tag: "brag", text: "hana posted a new photo", card: { title: "hana", body: "Lisbon, day 2.", actions: ["like"], photo: true } },
  { id: "n5", tag: "friend", text: "dorm 3F: 12 new messages", card: { title: "dorm 3F", body: "12 new messages", actions: ["reply"] } },
  { id: "n6", tag: "stranger", text: "unknown.fish wants to send you a message", card: { title: "unknown.fish", body: "Message request", actions: ["accept", "decline"] } },
  { id: "n7", tag: "self", text: "Your story got 41 views" },
  { id: "n8", tag: "brag", text: "daniel is live now", card: { title: "daniel", body: "LIVE · 1.2k watching", actions: ["like"], photo: true } },
  { id: "n9", tag: "friend", text: "minseo mentioned you in a comment", card: { title: "minseo", body: "@you this is so you", actions: ["reply"] } },
  { id: "n10", tag: "stranger", text: "Someone you don't follow tagged you", card: { title: "a.k.l tagged you", body: "Show it on your profile?", actions: ["accept", "decline"], labels: { accept: "Approve", decline: "Remove" } } },
  { id: "n11", tag: "self", text: "You have 2 new followers" },
  { id: "n12", tag: "brag", text: "yuna shared 9 photos", card: { title: "yuna", body: "Bali dump", actions: ["like"], photo: true } },
  { id: "n13", tag: "friend", text: "seoyeon: call me when you can", card: { title: "seoyeon", body: "call me when you can", actions: ["reply"] } },
  { id: "n14", tag: "stranger", text: "x_ray_ requested to follow you", card: { title: "x_ray_", body: "0 mutual friends", actions: ["accept", "decline"], ...follow } },
  { id: "n15", tag: "self", text: "Your post is doing better than 80% of your posts" },
  { id: "n16", tag: "brag", text: "taeho got engaged", card: { title: "taeho", body: "She said yes.", actions: ["like"], photo: true } },
  { id: "n17", tag: "friend", text: "Group call started in dorm 3F", card: { title: "dorm 3F", body: "Group call · 4 in", actions: ["reply"], labels: { reply: "Join" } } },
  { id: "n18", tag: "stranger", text: "New message request", card: { title: "Message request", body: "hey", actions: ["accept", "decline"] } },
  { id: "n19", tag: "self", text: "Someone saved your post" },
  { id: "n20", tag: "brag", text: "jiwoo posted for the first time in a while", card: { title: "jiwoo", body: "back.", actions: ["like"], photo: true } },
  { id: "n21", tag: "friend", text: "hana: miss you", card: { title: "hana", body: "miss you", actions: ["reply"] } },
  { id: "n22", tag: "stranger", text: "a.k.l requested to follow you", card: { title: "a.k.l", body: "1 mutual friend", actions: ["accept", "decline"], ...follow } },
  { id: "n23", tag: "self", text: "Your story ends in 1 hour" },
  { id: "n24", tag: "brag", text: "daniel and 4 others posted" },
];

/**
 * When each notice appears (ms from start). With 30 notices over 45s, gaps
 * shrink from ~4s to ~1s, so it starts readable and ends as a flood.
 */
export function noticeSchedule(durationMs: number, count = NOTICES.length): number[] {
  const start = 1500;
  const span = durationMs - start - 1500;
  // t = start + span * (i/(n-1))^0.7 : early gaps wide, late gaps narrow.
  return Array.from({ length: count }, (_, i) => Math.round(start + span * Math.pow(i / (count - 1), 0.7)));
}

/** How long a banner stays before it counts as ignored. */
export const BANNER_MS = 4000;
