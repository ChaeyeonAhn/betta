"use client";

// Mode A: 45 seconds in a fake SNS app, with your betta living above it.
//
// The bottom of the phone is the app: a scrolling feed, and notification
// banners that drop in faster and faster. The top is the water, where a fry
// grows into a full betta over the 45 seconds. Everything the visitor does
// (or doesn't) is logged as a FeedEvent, and each event lets a bubble go from
// where it happened: the touch point, the banner that timed out, the post that
// scrolled away. When the bubble reaches the fish, that event is added to the
// betta's genome on the phone, so the visitor watches their habits shape it.
//
// The events also go to the server in small batches; the server computes the
// real genome from the same events (lib/genome.ts), so the phone's preview
// and the betta on the projection end up the same.

import { useCallback, useEffect, useRef, useState } from "react";
import { APP_NAME, BANNER_MS, NOTICES, POSTS, noticeSchedule, type CardAction, type Notice } from "@/lib/feed";
import { genomeFromFeed } from "@/lib/genome";
import { FEED_MS, type FeedEvent } from "@/lib/protocol";
import { WaterBackdrop } from "@/app/_components/PaintedWater";
import { BettaPreview } from "../BettaPreview";
import styles from "./FakeFeed.module.css";

type Send = (batch: { events: FeedEvent[]; start?: boolean; done?: boolean }) => void;
type Banner = { notice: Notice; key: string };
type Point = { x: number; y: number };
type Log = (event: Omit<FeedEvent, "t">, from?: Point | null) => void;

const MIN_DWELL_MS = 300;
/** After the 45s, wait this long at most for bubbles still rising. */
const SETTLE_MS = 2600;
/** Banners over the 45s. The 24 notices come round again near the end, in the flood. */
const NOTICE_COUNT = 30;
const moodLine = (hue: number) => `hsl(${Math.round(hue * 360)} 80% 64%)`;
// The feed is scrolled for 45s; repeat the posts so it doesn't run out.
const FEED = [...POSTS, ...POSTS, ...POSTS].map((post, i) => ({ ...post, key: `${post.id}-${i}` }));

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
  const [genome, setGenome] = useState(() => genomeFromFeed([]));
  const [ripple, setRipple] = useState(0);

  const land = useCallback((event: FeedEvent) => {
    landed.current.push(event);
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
    bufferRef.current.push(event);
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
        // Let the last bubbles reach the fish before the server finishes the betta.
        const until = performance.now() + SETTLE_MS;
        settle = setInterval(() => {
          if (flying.current > 0 && performance.now() < until) return;
          clearInterval(settle);
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

  const openBanner = (banner: Banner) => {
    if (card) log({ kind: "close", tag: card.tag });
    log({ kind: "tap", tag: banner.notice.tag });
    dismiss(banner.key);
    setCard(banner.notice);
  };

  const swipeBanner = (banner: Banner) => {
    log({ kind: "ignore", tag: banner.notice.tag });
    dismiss(banner.key);
  };

  const react = (action: CardAction | "close") => {
    if (!card) return;
    log({ kind: action, tag: card.tag });
    setCard(null);
  };

  const like = (post: (typeof FEED)[number]) => {
    if (liked.has(post.key)) return;
    log({ kind: "like", tag: post.tag });
    setLiked((set) => new Set(set).add(post.key));
  };

  const growth = 1 - left / FEED_MS;

  return (
    <div className={styles.root}>
      <section className={styles.tank}>
        <WaterBackdrop />
        <div ref={fishRef} className={styles.fish}>
          <BettaPreview genome={genome} playerId={playerId} width={250} growth={growth} />
          {ripple > 0 && <span key={ripple} className={styles.ripple} aria-hidden />}
        </div>
        <p className={styles.tankNote} aria-live="polite">{over ? "Your betta is grown." : "Your betta is growing."}</p>
        <div className={styles.progress} style={{ transform: `scaleX(${left / FEED_MS})` }} />
      </section>

      <section
        className={`${styles.app} ${over ? styles.closed : ""}`}
        onPointerDownCapture={(e) => {
          touchRef.current = { x: e.clientX, y: e.clientY };
        }}
      >
        <header className={styles.header}>
          <span className={styles.appName}>{APP_NAME}</span>
        </header>

        <main className={styles.feed}>
          {FEED.map((post) => (
            <PostView key={post.key} post={post} liked={liked.has(post.key)} onLike={() => like(post)} log={log} />
          ))}
        </main>

        <footer className={styles.footer}>
          <button
            className={styles.postButton}
            onClick={() => {
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
                <span className={styles.bannerApp}>{APP_NAME}</span>
                <span>{banner.notice.text}</span>
              </button>
              <button className={styles.bannerClose} aria-label="Dismiss" onClick={() => swipeBanner(banner)}>
                ×
              </button>
            </div>
          ))}
          {banners.length > 3 && <div className={styles.more}>+{banners.length - 3} more</div>}
        </div>

        {card && (
          <div className={styles.scrim} onClick={() => react("close")}>
            <div className={styles.card} onClick={(e) => e.stopPropagation()}>
              <p className={styles.cardTitle}>{card.card.title}</p>
              <div className={styles.cardImage} style={card.tag === "mood" ? { "--mood": moodLine(card.card.hue) } as React.CSSProperties : undefined} />
              {card.card.body && <p className={styles.cardBody}>{card.card.body}</p>}
              <div className={styles.cardActions}>
                {card.card.actions.map((action) => (
                  <button key={action} className={styles.action} onClick={() => react(action)}>
                    {action === "like" ? "♡ Like" : action === "accept" ? "Accept" : action === "decline" ? "Decline" : "Reply"}
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
  post: (typeof FEED)[number];
  liked: boolean;
  onLike: () => void;
  log: Log;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let since: number | null = null;
    const end = () => {
      if (since === null) return;
      const ms = Math.round(performance.now() - since);
      since = null;
      if (ms >= MIN_DWELL_MS) log({ kind: "dwell", tag: post.tag, ms, hue: post.hue }, center(el.getBoundingClientRect()));
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) since ??= performance.now();
        else end();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    window.addEventListener("betta-feed-end", end);
    return () => {
      observer.disconnect();
      window.removeEventListener("betta-feed-end", end);
    };
  }, [post, log]);

  return (
    <article ref={ref} className={styles.post}>
      <p className={styles.author}>{post.author}</p>
      <div className={styles.image} style={post.tag === "mood" ? { "--mood": moodLine(post.hue) } as React.CSSProperties : undefined} />
      <div className={styles.postFoot}>
        <button className={styles.like} onClick={onLike}>
          {liked ? "♥" : "♡"}
        </button>
        <span>{post.text}</span>
      </div>
    </article>
  );
}
