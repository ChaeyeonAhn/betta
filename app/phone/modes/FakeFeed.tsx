"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BANNER_MS, NOTICES, POSTS, noticeSchedule, type CardAction, type Notice } from "@/lib/feed";
import { FEED_MS, type ClientToServer, type FeedEvent } from "@/lib/protocol";
import { loadSound, playSound } from "@/app/_components/sound";
import styles from "./FakeFeed.module.css";

type Banner = { notice: Notice; key: string; at: number };
type FeedPost = (typeof POSTS)[number] & { key: string };
type Send = ClientToServer["feed"];
type Log = (event: Omit<FeedEvent, "t" | "id">, id?: string, at?: number) => boolean;

const MIN_DWELL_MS = 300;
const DWELL_SLICE_MS = 1500;
const MORE_PX = 1200;
const TAP_SOUND = "/audio/bubbles/bubble-cluster-phone.mp3";

const BANNERS: Banner[] = noticeSchedule(FEED_MS, 30).map((at, i) => ({
  notice: NOTICES[i % NOTICES.length],
  key: `notice-${i}`,
  at,
}));
const ACTION_LABEL: Record<CardAction, string> = { like: "♡ Like", accept: "Accept", decline: "Decline", reply: "Reply" };

function readEvents(storageKey: string, roundId: string): FeedEvent[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (saved?.roundId === roundId && Array.isArray(saved.events)) return saved.events;
  } catch {
    // The session still works if storage is disabled.
  }
  return [];
}

export function FakeFeed({ send, roundId, storageKey, startedAt, clockOffset, done, connected }: {
  send: Send;
  roundId: string;
  storageKey: string;
  startedAt: number | null;
  clockOffset: number;
  done: boolean;
  connected: boolean;
}) {
  const [savedEvents] = useState(() => readEvents(storageKey, roundId));
  const events = useRef(new Map(savedEvents.map((event) => [event.id, event])));
  const [banners, setBanners] = useState<Banner[]>([]);
  const [card, setCard] = useState<Banner | null>(null);
  const cardRef = useRef<Banner | null>(null);
  const [liked, setLiked] = useState(() => new Set(savedEvents.filter((event) => event.kind === "like").map((event) => event.id)));
  const [posted, setPosted] = useState(() => savedEvents.some((event) => event.kind === "post"));
  const [over, setOver] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const activeBanners = useRef(new Map<string, Banner>());
  const [feedEnd] = useState(() => new EventTarget());
  const tapX = useRef<number | null>(null);
  const deadline = startedAt === null ? null : startedAt + FEED_MS;
  const active = deadline !== null && !done && !over;
  const serverTime = useCallback(() => Date.now() + clockOffset, [clockOffset]);

  const changeCard = useCallback((banner: Banner | null) => {
    cardRef.current = banner;
    setCard(banner);
  }, []);

  const log: Log = useCallback((partial, id, at = serverTime()) => {
    if (startedAt === null || deadline === null || done || at > deadline) return false;
    // Multiple visits to a post may create distinct dwell slices. Each user
    // action keeps its id when the journal is replayed after a reconnect.
    const eventId = id ?? Array.from(crypto.getRandomValues(new Uint32Array(2)), (value) => value.toString(36)).join("-");
    if (events.current.has(eventId)) return false;
    const event: FeedEvent = { ...partial, t: Math.max(0, at - startedAt), id: eventId };
    events.current.set(eventId, event);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ roundId, events: [...events.current.values()] }));
    } catch {
      // Stay in memory for this visit.
    }
    send({ roundId, events: [event] });
    return true;
  }, [startedAt, deadline, done, roundId, storageKey, send, serverTime]);

  useEffect(() => {
    if (!connected || done) return;
    if (startedAt === null) {
      if (startRequested) send({ roundId, events: [], start: true });
      return;
    }
    // The server deduplicates ids. Replay after hello so a packet lost on a
    // socket handoff or page reload still belongs to the same visit.
    const saved = [...events.current.values()];
    for (let i = 0; i < saved.length; i += 500) {
      send({ roundId, events: saved.slice(i, i + 500) });
    }
    if (over) send({ roundId, events: [], done: true });
  }, [connected, done, over, roundId, send, startedAt, startRequested]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    if (startedAt !== null && startRequested && !done) scrollRef.current?.focus();
  }, [startedAt, done, startRequested]);

  useEffect(() => {
    if (deadline === null || startedAt === null || done) return;
    const boundaries = BANNERS.flatMap(({ at }) => [startedAt + at, startedAt + at + BANNER_MS])
      .filter((at) => at < deadline)
      .sort((a, b) => a - b);
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      const now = serverTime();
      const visible = document.visibilityState === "visible";
      for (const [key, banner] of activeBanners.current) {
        const expires = startedAt + banner.at + BANNER_MS;
        if (!visible || now >= expires || now >= deadline || events.current.has(key)) {
          if (visible && expires <= now && expires <= deadline) log({ kind: "ignore", tag: banner.notice.tag }, key, expires);
          activeBanners.current.delete(key);
        }
      }
      if (now >= deadline) {
        feedEnd.dispatchEvent(new Event("end"));
        const openCard = cardRef.current;
        if (openCard) log({ kind: "close", tag: openCard.notice.tag }, `card-${openCard.key}`, deadline);
        changeCard(null);
        setBanners([]);
        setOver(true);
        return;
      }
      if (visible) {
        for (const banner of BANNERS) {
          const appears = startedAt + banner.at;
          if (now >= appears && now < appears + BANNER_MS && !events.current.has(banner.key)) {
            activeBanners.current.set(banner.key, banner);
          }
        }
      }
      setBanners([...activeBanners.current.values()].reverse());
      const next = (visible ? boundaries.find((at) => at > now) : undefined) ?? deadline;
      timer = setTimeout(sync, next - now);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [changeCard, deadline, done, feedEnd, log, serverTime, startedAt]);

  const tapSound = useRef<AudioBuffer | null>(null);
  useEffect(() => {
    loadSound(TAP_SOUND)
      .then((buffer) => { tapSound.current = buffer; })
      .catch((error) => console.warn("[betta] tap sound failed to load", error));
  }, []);
  const pop = () => {
    if (!tapSound.current) return;
    const x = tapX.current ?? window.innerWidth / 2;
    playSound(tapSound.current, { rate: 1 + Math.random() * 0.2, gain: 0.8, pan: (x / window.innerWidth - 0.5) });
  };

  const selectBanner = (banner: Banner, kind: "tap" | "ignore") => {
    const now = serverTime();
    if (startedAt === null || now >= startedAt + banner.at + BANNER_MS) return;
    if (!log({ kind, tag: banner.notice.tag, intent: true }, banner.key, now)) return;
    pop();
    activeBanners.current.delete(banner.key);
    setBanners((list) => list.filter((item) => item.key !== banner.key));
    if (kind === "ignore") return;
    if (card) log({ kind: "close", tag: card.notice.tag }, `card-${card.key}`, now);
    changeCard(banner.notice.card ? banner : null);
  };

  const react = (action: CardAction | "close") => {
    if (!card || !log({ kind: action, tag: card.notice.tag, intent: true }, `card-${card.key}`)) return;
    pop();
    changeCard(null);
  };

  const [pages, setPages] = useState(3);
  const feed = useMemo(() => Array.from({ length: pages }, (_, page) =>
    POSTS.map((post) => ({ ...post, key: `${post.id}-${page}` })),
  ).flat(), [pages]);

  const like = (post: FeedPost) => {
    if (!log({ kind: "like", tag: post.tag, intent: true }, post.key)) return;
    pop();
    setLiked((set) => new Set(set).add(post.key));
  };
  const cardContent = active ? card?.notice.card : undefined;

  return (
    <div className={styles.root}>
      <section
        className={styles.app}
        inert={!active}
        onPointerDownCapture={(event) => { tapX.current = event.clientX; }}
      >
        <main
          ref={scrollRef}
          className={styles.feed}
          tabIndex={active ? 0 : undefined}
          onScroll={(event) => {
            const el = event.currentTarget;
            if (active && el.scrollTop + el.clientHeight > el.scrollHeight - MORE_PX) setPages((n) => n + 1);
          }}
        >
          {feed.map((post) => (
            <PostView
              key={post.key}
              post={post}
              liked={liked.has(post.key)}
              onLike={() => like(post)}
              deadline={active ? deadline : null}
              feedEnd={feedEnd}
              serverTime={serverTime}
              log={log}
            />
          ))}
        </main>

        <footer className={styles.footer}>
          <button
            className={styles.postButton}
            onClick={() => {
              if (!log({ kind: "post", tag: "self", intent: true })) return;
              pop();
              setPosted(true);
            }}
          >
            {posted ? "Posted" : "+ Post"}
          </button>
        </footer>

        {active && (
          <div className={styles.banners}>
            {banners.slice(0, 3).map((banner) => (
              <div key={banner.key} className={styles.banner}>
                <button className={styles.bannerBody} onClick={() => selectBanner(banner, "tap")}>
                  <span>{banner.notice.text}</span>
                </button>
                <button className={styles.bannerClose} aria-label="Dismiss" onClick={() => selectBanner(banner, "ignore")}>
                  ×
                </button>
              </div>
            ))}
            {banners.length > 3 && <div className={styles.more}>+{banners.length - 3} more</div>}
          </div>
        )}

        {cardContent && (
          <div className={styles.scrim} onClick={() => react("close")}>
            <div className={styles.card} onClick={(e) => e.stopPropagation()}>
              <p className={styles.cardTitle}>{cardContent.title}</p>
              {cardContent.photo && <div className={styles.cardImage} />}
              {cardContent.body && <p className={styles.cardBody}>{cardContent.body}</p>}
              <div className={styles.cardActions}>
                {cardContent.actions.map((action) => (
                  <button key={action} className={styles.action} onClick={() => react(action)}>
                    {cardContent.labels?.[action] ?? ACTION_LABEL[action]}
                  </button>
                ))}
                <button className={styles.actionGhost} onClick={() => react("close")}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {startedAt === null && !done && (
        <dialog
          ref={dialogRef}
          className={styles.intro}
          aria-labelledby="feed-intro-title"
          onCancel={(event) => event.preventDefault()}
        >
          <h1 id="feed-intro-title">Do whatever you want!</h1>
          <button autoFocus disabled={!connected || startRequested} onClick={() => setStartRequested(true)}>
            OK
          </button>
        </dialog>
      )}
    </div>
  );
}

function PostView({ post, liked, onLike, deadline, feedEnd, serverTime, log }: {
  post: FeedPost;
  liked: boolean;
  onLike: () => void;
  deadline: number | null;
  feedEnd: EventTarget;
  serverTime: () => number;
  log: Log;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || deadline === null) return;
    let since: number | null = null;
    let tick: ReturnType<typeof setInterval> | undefined;
    let inView = false;
    const slice = (min: number) => {
      if (since === null) return;
      const now = Math.min(serverTime(), deadline);
      const ms = now - since;
      if (ms < min) return;
      since = now;
      log({ kind: "dwell", tag: post.tag, ms, hue: post.hue }, undefined, now);
    };
    const end = () => {
      slice(MIN_DWELL_MS);
      since = null;
      clearInterval(tick);
    };
    const sync = () => {
      if (!inView || document.visibilityState !== "visible" || serverTime() >= deadline) {
        end();
      } else if (since === null) {
        since = serverTime();
        tick = setInterval(() => slice(DWELL_SLICE_MS), DWELL_SLICE_MS);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.intersectionRatio >= 0.6;
      sync();
    }, { threshold: 0.6 });
    observer.observe(el);
    feedEnd.addEventListener("end", end);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      end();
      feedEnd.removeEventListener("end", end);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [deadline, feedEnd, log, post, serverTime]);

  return (
    <article ref={ref} className={styles.post}>
      <p className={styles.author}>{post.author}</p>
      <div className={styles.image} />
      <div className={styles.postFoot}>
        <button className={styles.like} aria-label="Like" aria-pressed={liked} onClick={onLike}>
          {liked ? "♥" : "♡"}
        </button>
        <span>{post.text}</span>
      </div>
    </article>
  );
}
