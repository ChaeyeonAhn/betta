"use client";

// 45 seconds in a fake SNS app, with your betta living above it.
//
// The bottom of the phone is the app: a scrolling feed, and notification
// banners that drop in faster and faster. The top is the water, where a fry
// grows into a full betta over the 45 seconds. Everything the visitor does
// (or doesn't) is logged as a FeedEvent, and each event lets a bubble go from
// where it happened: the touch point, the banner that timed out, the post that
// scrolled away. When the bubble reaches the fish, that event is added to the
// betta's genome on the phone, so the visitor watches their habits shape it.
//
// An event goes to the server only once its bubble has landed, and the feed
// finishes only after the last bubble lands (or is dropped from both sides).
// The server computes the genome from exactly the events the fish took in
// (lib/genome.ts), so the betta on the phone, the one it releases and the
// one on the projection are the same fish.
//
// News about you (likes, views, followers) is done with one tap. Only a
// notice that asks for something opens a card: Reply to a message, Accept or
// Decline a request, ♡ a friend's new post. The feed scrolls without end.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BANNER_MS, NOTICES, POSTS, noticeSchedule, type CardAction, type Notice } from "@/lib/feed";
import { genomeFromFeed } from "@/lib/genome";
import { FEED_MS, type FeedEvent } from "@/lib/protocol";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { loadSound, playSound } from "@/app/_components/sound";
import { BettaPreview } from "../BettaPreview";
import styles from "./FakeFeed.module.css";

type Send = (batch: { events: FeedEvent[]; start?: boolean; done?: boolean }) => void;
type Banner = { notice: Notice; key: string };
type Point = { x: number; y: number };
type Log = (event: Omit<FeedEvent, "t">, from?: Point | null) => void;

const MIN_DWELL_MS = 300;
/** A post on screen sends its dwell this often. */
const DWELL_SLICE_MS = 1500;
/** After the 45s, wait this long at most for bubbles still rising (the slowest take ~4s). */
const SETTLE_MS = 5500;
/** Banners over the 45s. The 24 notices come round again near the end, in the flood. */
const NOTICE_COUNT = 30;
type FeedPost = (typeof POSTS)[number] & { key: string };
/** The posts again and again: the feed never runs out. */
const feedPage = (page: number): FeedPost[] => POSTS.map((post, i) => ({ ...post, key: `${post.id}-${page}-${i}` }));
/** Load another round of posts this close to the bottom. */
const MORE_PX = 1200;

/** Every button press in the app pops bubbles (octave-up render for phone speakers). */
const TAP_SOUND = "/audio/bubbles/bubble-cluster-phone.mp3";

const ACTION_LABEL: Record<CardAction, string> = { like: "♡ Like", accept: "Accept", decline: "Decline", reply: "Reply" };

const center = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

export function FakeFeed({ send, playerId }: { send: Send; playerId: string }) {
  const startRef = useRef(0);
  const bufferRef = useRef<FeedEvent[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [card, setCard] = useState<Notice | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [posted, setPosted] = useState(false);
  const [left, setLeft] = useState(FEED_MS);
  const [over, setOver] = useState(false);
  const cardRef = useRef<Notice | null>(null);
  /** Banners still on screen, so a timeout knows whether it was already tapped or swiped. */
  const activeRef = useRef<Set<string>>(new Set());
  const bannerEls = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    cardRef.current = card;
  }, [card]);

  // ------------------------------------------------------------ bubbles → betta
  const fishRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<Point | null>(null);
  /** Events whose bubble reached the fish: the betta is made of these. */
  const landed = useRef<FeedEvent[]>([]);
  const flying = useRef(0);
  /** Set when the finished betta goes to the server; nothing lands after that. */
  const sealed = useRef(false);
  const [genome, setGenome] = useState(() => genomeFromFeed([]));
  const [ripple, setRipple] = useState(0);

  const land = useCallback((event: FeedEvent) => {
    if (sealed.current) return;
    landed.current.push(event);
    bufferRef.current.push(event);
    setGenome(genomeFromFeed(landed.current));
    setRipple((n) => n + 1);
  }, []);

  const bubble = useCallback((event: FeedEvent, from: Point, faint: boolean) => {
    const layer = layerRef.current;
    const fish = fishRef.current?.getBoundingClientRect();
    if (!layer || !fish) {
      land(event);
      return;
    }
    const el = document.createElement("span");
    el.className = `${styles.bubble} ${faint ? styles.faint : ""}`;
    const size = faint ? 7 + Math.random() * 4 : 10 + Math.random() * 9;
    el.style.width = el.style.height = `${size}px`;
    layer.appendChild(el);

    const to = { x: fish.left + fish.width * (0.38 + Math.random() * 0.24), y: fish.top + fish.height * (0.42 + Math.random() * 0.16) };
    const sway = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 22);
    const at = (t: number, wobble: number, scale: number) => {
      const x = from.x + (to.x - from.x) * t + wobble - size / 2;
      const y = from.y + (to.y - from.y) * t - size / 2;
      return `translate(${x}px, ${y}px) scale(${scale})`;
    };
    const rise = from.y - to.y;
    const duration = (faint ? 2200 : 1300) + Math.max(0, rise) * (faint ? 2.2 : 1.4);
    flying.current++;
    const animation = el.animate([
      { transform: at(0, 0, 0.3), opacity: 0 },
      { transform: at(0.08, sway * 0.2, 1), opacity: faint ? 0.45 : 1, offset: 0.1 },
      { transform: at(0.4, sway, 1), offset: 0.42 },
      { transform: at(0.75, -sway * 0.6, 0.95), offset: 0.76 },
      { transform: at(1, 0, 0.5), opacity: faint ? 0.25 : 0.8 },
    ], { duration, easing: "cubic-bezier(.45,.05,.55,.95)" });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.remove();
      flying.current--;
      land(event);
    };
    animation.onfinish = finish;
    animation.oncancel = finish;
    // Paused animations (background tab) still land, a little late.
    setTimeout(finish, duration + 1500);
  }, [land]);

  const log: Log = useCallback((partial, from) => {
    const event: FeedEvent = { ...partial, t: Math.round(performance.now() - startRef.current) };
    const origin = from ?? touchRef.current ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.8 };
    bubble(event, origin, partial.kind === "ignore");
  }, [bubble]);

  const dismiss = useCallback((key: string) => {
    activeRef.current.delete(key);
    bannerEls.current.delete(key);
    setBanners((list) => list.filter((b) => b.key !== key));
  }, []);

  // Clock, notice schedule, batching, and the end of the 45 seconds.
  useEffect(() => {
    startRef.current = performance.now();
    send({ events: [], start: true });
    const timers: ReturnType<typeof setTimeout>[] = [];
    let settle: ReturnType<typeof setInterval> | undefined;

    noticeSchedule(FEED_MS, NOTICE_COUNT).forEach((at, i) => {
      const notice = NOTICES[i % NOTICES.length];
      const key = `${notice.id}-${at}`;
      timers.push(
        setTimeout(() => {
          activeRef.current.add(key);
          setBanners((list) => [{ notice, key }, ...list]);
          timers.push(
            setTimeout(() => {
              if (!activeRef.current.has(key)) return; // tapped or swiped already
              const el = bannerEls.current.get(key);
              log({ kind: "ignore", tag: notice.tag }, el ? center(el.getBoundingClientRect()) : null);
              dismiss(key);
            }, BANNER_MS),
          );
        }, at),
      );
    });

    const flush = setInterval(() => {
      if (bufferRef.current.length) send({ events: bufferRef.current.splice(0) });
    }, 1000);
    const clock = setInterval(() => setLeft(Math.max(0, FEED_MS - (performance.now() - startRef.current))), 250);

    timers.push(
      setTimeout(() => {
        window.dispatchEvent(new Event("betta-feed-end")); // posts flush their dwell
        if (cardRef.current) log({ kind: "close", tag: cardRef.current.tag });
        setOver(true);
        setCard(null);
        setBanners([]);
        activeRef.current.clear();
        // Let the last bubbles reach the fish, then seal: the server gets
        // exactly the events that landed, nothing that was still rising.
        const until = performance.now() + SETTLE_MS;
        settle = setInterval(() => {
          if (flying.current > 0 && performance.now() < until) return;
          clearInterval(settle);
          sealed.current = true;
          send({ events: bufferRef.current.splice(0), done: true });
        }, 100);
      }, FEED_MS),
    );

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(settle);
      clearInterval(flush);
      clearInterval(clock);
    };
  }, [send, log, dismiss]);

  const tapSound = useRef<AudioBuffer | null>(null);
  useEffect(() => {
    loadSound(TAP_SOUND)
      .then((buffer) => { tapSound.current = buffer; })
      .catch((error) => console.warn("[betta] tap sound failed to load", error));
  }, []);
  /** Bubbles from where the finger is, a little different each time. */
  const pop = () => {
    if (!tapSound.current) return;
    const x = touchRef.current?.x ?? window.innerWidth / 2;
    playSound(tapSound.current, { rate: 1 + Math.random() * 0.2, gain: 0.8, pan: (x / window.innerWidth - 0.5) });
  };

  // News about you ends with the tap; a notice that asks something opens its card.
  const openBanner = (banner: Banner) => {
    pop();
    if (card) log({ kind: "close", tag: card.tag });
    log({ kind: "tap", tag: banner.notice.tag });
    dismiss(banner.key);
    setCard(banner.notice.card ? banner.notice : null);
  };

  const swipeBanner = (banner: Banner) => {
    pop();
    log({ kind: "ignore", tag: banner.notice.tag });
    dismiss(banner.key);
  };

  const react = (action: CardAction | "close") => {
    if (!card) return;
    pop();
    log({ kind: action, tag: card.tag });
    setCard(null);
  };

  const [pages, setPages] = useState(3);
  const feed = useMemo(() => Array.from({ length: pages }, (_, page) => feedPage(page)).flat(), [pages]);

  const like = (post: FeedPost) => {
    if (liked.has(post.key)) return;
    pop();
    log({ kind: "like", tag: post.tag });
    setLiked((set) => new Set(set).add(post.key));
  };

  const growth = 1 - left / FEED_MS;

  return (
    <div className={styles.root}>
      <section className={styles.tank}>
        <WaterBackdrop />
        <div ref={fishRef} className={styles.fish}>
          <BettaPreview genome={genome} playerId={playerId} width={200} growth={growth} />
          {ripple > 0 && <span key={ripple} className={styles.ripple} aria-hidden />}
        </div>
        <div className={styles.progress} style={{ transform: `scaleX(${left / FEED_MS})` }} />
      </section>

      <section
        className={`${styles.app} ${over ? styles.closed : ""}`}
        onPointerDownCapture={(e) => {
          touchRef.current = { x: e.clientX, y: e.clientY };
        }}
      >
        <main
          className={styles.feed}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight > el.scrollHeight - MORE_PX) setPages((n) => n + 1);
          }}
        >
          {feed.map((post) => (
            <PostView key={post.key} post={post} liked={liked.has(post.key)} onLike={() => like(post)} log={log} />
          ))}
        </main>

        <footer className={styles.footer}>
          <button
            className={styles.postButton}
            onClick={() => {
              pop();
              log({ kind: "post", tag: "self" });
              setPosted(true);
            }}
          >
            {posted ? "Posted" : "+ Post"}
          </button>
        </footer>

        <div className={styles.banners}>
          {banners.slice(0, 3).map((banner) => (
            <div
              key={banner.key}
              className={styles.banner}
              ref={(el) => {
                if (el) bannerEls.current.set(banner.key, el);
              }}
            >
              <button className={styles.bannerBody} onClick={() => openBanner(banner)}>
                <span>{banner.notice.text}</span>
              </button>
              <button className={styles.bannerClose} aria-label="Dismiss" onClick={() => swipeBanner(banner)}>
                ×
              </button>
            </div>
          ))}
          {banners.length > 3 && <div className={styles.more}>+{banners.length - 3} more</div>}
        </div>

        {card?.card && (
          <div className={styles.scrim} onClick={() => react("close")}>
            <div className={styles.card} onClick={(e) => e.stopPropagation()}>
              <p className={styles.cardTitle}>{card.card.title}</p>
              {card.card.photo && <div className={styles.cardImage} />}
              {card.card.body && <p className={styles.cardBody}>{card.card.body}</p>}
              <div className={styles.cardActions}>
                {card.card.actions.map((action) => (
                  <button key={action} className={styles.action} onClick={() => react(action)}>
                    {card.card?.labels?.[action] ?? ACTION_LABEL[action]}
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

      <div ref={layerRef} className={styles.bubbles} aria-hidden />
    </div>
  );
}

/** One post. Logs how long it was at least 60% on screen; the bubble leaves from the post. */
function PostView({
  post,
  liked,
  onLike,
  log,
}: {
  post: FeedPost;
  liked: boolean;
  onLike: () => void;
  log: Log;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let since: number | null = null;
    let tick: ReturnType<typeof setInterval> | undefined;
    // Dwell goes out in slices while the post is on screen, so the betta
    // changes as the visitor lingers, not all at once when they scroll away
    // or the 45 seconds end.
    const slice = (min: number) => {
      if (since === null) return;
      const now = performance.now();
      const ms = Math.round(now - since);
      if (ms < min) return;
      since = now;
      log({ kind: "dwell", tag: post.tag, ms, hue: post.hue }, center(el.getBoundingClientRect()));
    };
    const end = () => {
      slice(MIN_DWELL_MS);
      since = null;
      clearInterval(tick);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (since !== null) return;
          since = performance.now();
          tick = setInterval(() => slice(DWELL_SLICE_MS), DWELL_SLICE_MS);
        } else end();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    window.addEventListener("betta-feed-end", end);
    return () => {
      observer.disconnect();
      clearInterval(tick);
      window.removeEventListener("betta-feed-end", end);
    };
  }, [post, log]);

  return (
    <article ref={ref} className={styles.post}>
      <p className={styles.author}>{post.author}</p>
      <div className={styles.image} />
      <div className={styles.postFoot}>
        <button className={styles.like} onClick={onLike}>
          {liked ? "♥" : "♡"}
        </button>
        <span>{post.text}</span>
      </div>
    </article>
  );
}
