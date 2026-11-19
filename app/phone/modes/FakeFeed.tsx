"use client";

// Mode A: 30 seconds in a fake SNS app. Notification banners drop in faster
// and faster over a scrolling feed. Everything the visitor does (or doesn't)
// is logged as FeedEvents and sent to the server in small batches; the server
// turns them into a Genome (lib/genome.ts). Wireframe styling on purpose.

import { useCallback, useEffect, useRef, useState } from "react";
import { APP_NAME, BANNER_MS, NOTICES, POSTS, noticeSchedule, type CardAction, type Notice } from "@/lib/feed";
import { FEED_MS, type FeedEvent } from "@/lib/protocol";
import styles from "./FakeFeed.module.css";

type Send = (batch: { events: FeedEvent[]; start?: boolean; done?: boolean }) => void;
type Banner = { notice: Notice; key: string };

const MIN_DWELL_MS = 300;
const tint = (hue: number) => `hsl(${Math.round(hue * 360)} 45% 82%)`;
// The feed is scrolled for 30s; repeat the posts so it doesn't run out.
const FEED = [...POSTS, ...POSTS].map((post, i) => ({ ...post, key: `${post.id}-${i}` }));

export function FakeFeed({ send }: { send: Send }) {
  const startRef = useRef(0);
  const bufferRef = useRef<FeedEvent[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [card, setCard] = useState<Notice | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [posted, setPosted] = useState(false);
  const [left, setLeft] = useState(FEED_MS);
  const cardRef = useRef<Notice | null>(null);
  /** Banners still on screen, so a timeout knows whether it was already tapped or swiped. */
  const activeRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    cardRef.current = card;
  }, [card]);

  const log = useCallback((event: Omit<FeedEvent, "t">) => {
    bufferRef.current.push({ ...event, t: Math.round(performance.now() - startRef.current) });
  }, []);

  const dismiss = useCallback((key: string) => {
    activeRef.current.delete(key);
    setBanners((list) => list.filter((b) => b.key !== key));
  }, []);

  // Clock, notice schedule, batching, and the end of the 30 seconds.
  useEffect(() => {
    startRef.current = performance.now();
    send({ events: [], start: true });
    const timers: ReturnType<typeof setTimeout>[] = [];

    noticeSchedule(FEED_MS).forEach((at, i) => {
      const notice = NOTICES[i];
      const key = `${notice.id}-${at}`;
      timers.push(
        setTimeout(() => {
          activeRef.current.add(key);
          setBanners((list) => [{ notice, key }, ...list]);
          timers.push(
            setTimeout(() => {
              if (!activeRef.current.has(key)) return; // tapped or swiped already
              log({ kind: "ignore", tag: notice.tag });
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
        send({ events: bufferRef.current.splice(0), done: true });
      }, FEED_MS),
    );

    return () => {
      timers.forEach(clearTimeout);
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

  return (
    <div className={styles.root}>
      <div className={styles.progress} style={{ transform: `scaleX(${left / FEED_MS})` }} />

      <header className={styles.header}>
        <span className={styles.app}>{APP_NAME}</span>
      </header>

      <main className={styles.feed}>
        {FEED.map((post) => (
          <PostView key={post.key} post={post} liked={liked.has(post.key)} onLike={() => like(post)} log={log} />
        ))}
      </main>

      {/* Bottom bar, so banners at the top never cover it. */}
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
          <div key={banner.key} className={styles.banner}>
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
            <div className={styles.cardImage} style={{ background: tint(card.card.hue) }} />
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
    </div>
  );
}

/** One post. Logs how long it was at least 60% on screen. */
function PostView({
  post,
  liked,
  onLike,
  log,
}: {
  post: (typeof FEED)[number];
  liked: boolean;
  onLike: () => void;
  log: (event: Omit<FeedEvent, "t">) => void;
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
      if (ms >= MIN_DWELL_MS) log({ kind: "dwell", tag: post.tag, ms, hue: post.hue });
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
      <div className={styles.image} style={{ background: tint(post.hue) }} />
      <div className={styles.postFoot}>
        <button className={styles.like} onClick={onLike}>
          {liked ? "♥" : "♡"}
        </button>
        <span>{post.text}</span>
      </div>
    </article>
  );
}
