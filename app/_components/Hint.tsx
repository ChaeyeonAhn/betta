// A small white-line icon that fades in every 3 seconds and acts out what to
// do, in place of written instructions. Shared by the phone and the projection.
//
//   turn   a phone rocking left and right: turn your phone to look around
//   tap    a finger tapping, with a ring: tap your phone
//   steer  a dot circling inside a ring: steer with the console
//   swipe  a finger sliding up under a chevron: swipe up to release

import styles from "./Hint.module.css";

export function Hint({ kind, size = 72, className }: { kind: "turn" | "tap" | "steer" | "swipe"; size?: number; className?: string }) {
  return (
    <svg className={`${styles.hint} ${className ?? ""}`} style={{ width: size }} viewBox="0 0 64 48" aria-hidden>
      {kind === "turn" && (
        <>
          <path className={`${styles.nudge} ${styles.left}`} d="M13 19 l-5 5 l5 5" />
          <path className={`${styles.nudge} ${styles.right}`} d="M51 19 l5 5 l-5 5" />
          <g className={styles.rock}>
            <rect x="23" y="8" width="18" height="32" rx="3.5" />
            <path d="M29.5 36h5" />
          </g>
        </>
      )}
      {kind === "tap" && (
        <>
          <circle className={styles.ring} cx="32" cy="14" r="6" />
          <g className={styles.press}>
            {/* An index finger pointing up, the hand below it. */}
            <path d="M29 30 V15 a3 3 0 0 1 6 0 V27 l6.5 1.6 a3.2 3.2 0 0 1 2.4 3.6 L43 40 H30 L25.5 33.5 a2.4 2.4 0 0 1 3.5 -3.2 Z" />
          </g>
        </>
      )}
      {kind === "swipe" && (
        <>
          <path className={styles.chevron} d="M26 10 l6 -5 l6 5" />
          <g className={styles.slide}>
            <path d="M29 30 V15 a3 3 0 0 1 6 0 V27 l6.5 1.6 a3.2 3.2 0 0 1 2.4 3.6 L43 40 H30 L25.5 33.5 a2.4 2.4 0 0 1 3.5 -3.2 Z" />
          </g>
        </>
      )}
      {kind === "steer" && (
        <>
          <circle cx="32" cy="24" r="16" />
          <g className={styles.orbit}>
            <circle cx="32" cy="24" r="4" className={styles.dot} />
          </g>
        </>
      )}
    </svg>
  );
}
