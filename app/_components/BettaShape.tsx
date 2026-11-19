// Wireframe betta, drawn from a Genome. Placeholder until the real betta
// (docs/plan.md §6); the mapping is the part meant to survive.
//
//   hue          body + fin colour
//   saturation   how vivid the fills are (plain wild fish → bred show fish)
//   finLength    tail fan radius, dorsal/anal fin height
//   boundary     dashed membrane around the fish = personal space
//   sociability  tail rhythm: slow and heavy → quick and lively

import type { CSSProperties } from "react";
import type { Genome } from "@/lib/protocol";
import styles from "./BettaShape.module.css";

type Props = {
  genome: Genome;
  /** Width in px; height follows (200 × 140 viewBox). */
  size?: number;
  /** Short label under the fish so a visitor can find theirs. */
  label?: string;
};

const BODY_X = 110;
const BODY_Y = 70;
const TAIL_X = 74; // where the tail fan joins the body

export function BettaShape({ genome, size = 200, label }: Props) {
  const { hue, saturation, finLength, boundary, sociability } = genome;
  const h = Math.round(hue * 360);
  const s = Math.round(15 + saturation * 70);
  const fill = `hsl(${h} ${s}% 55% / 0.85)`;
  const finFill = `hsl(${h} ${s}% 62% / ${0.18 + saturation * 0.3})`;
  const line = `hsl(${h} ${Math.min(s, 40)}% 88%)`;

  // Halfmoon tail: a fan opening backwards from TAIL_X.
  const r = 28 + finLength * 46;
  const spread = (55 + finLength * 30) * (Math.PI / 180);
  const top = { x: TAIL_X - r * Math.cos(spread), y: BODY_Y - r * Math.sin(spread) };
  const bottom = { x: TAIL_X - r * Math.cos(spread), y: BODY_Y + r * Math.sin(spread) };
  const tail = `M ${TAIL_X} ${BODY_Y - 6} L ${top.x} ${top.y} A ${r} ${r} 0 0 0 ${bottom.x} ${bottom.y} L ${TAIL_X} ${BODY_Y + 6} Z`;

  const finH = 8 + finLength * 26;
  const dorsal = `M 120 ${BODY_Y - 13} Q 100 ${BODY_Y - 13 - finH} ${TAIL_X + 4} ${BODY_Y - 10 - finH * 0.6} L ${TAIL_X + 6} ${BODY_Y - 8} Z`;
  const anal = `M 118 ${BODY_Y + 12} Q 98 ${BODY_Y + 14 + finH} ${TAIL_X + 4} ${BODY_Y + 10 + finH * 0.7} L ${TAIL_X + 6} ${BODY_Y + 8} Z`;

  const membrane = 46 + boundary * 22;
  const rhythm = {
    "--beat": `${(2.8 - sociability * 2).toFixed(2)}s`,
    "--swing": `${(5 + sociability * 9).toFixed(1)}deg`,
  } as CSSProperties;

  return (
    <figure className={styles.root} style={{ width: size }}>
      <svg viewBox="0 0 200 140" width={size} height={size * 0.7} style={rhythm} aria-hidden>
        <circle
          cx={BODY_X - 14}
          cy={BODY_Y}
          r={membrane}
          fill="none"
          stroke={line}
          strokeOpacity={0.25 + boundary * 0.4}
          strokeDasharray="3 5"
        />
        <g className={styles.tail} style={{ transformOrigin: `${TAIL_X}px ${BODY_Y}px` }}>
          <path d={tail} fill={finFill} stroke={line} strokeWidth={1} />
          {/* fin rays */}
          {[-0.75, -0.4, 0, 0.4, 0.75].map((k) => (
            <line
              key={k}
              x1={TAIL_X}
              y1={BODY_Y}
              x2={TAIL_X - r * Math.cos(spread * k)}
              y2={BODY_Y + r * Math.sin(spread * k)}
              stroke={line}
              strokeOpacity={0.35}
              strokeWidth={0.6}
            />
          ))}
        </g>
        <g className={styles.fins} style={{ transformOrigin: `${TAIL_X + 10}px ${BODY_Y}px` }}>
          <path d={dorsal} fill={finFill} stroke={line} strokeWidth={1} />
          <path d={anal} fill={finFill} stroke={line} strokeWidth={1} />
        </g>
        <ellipse cx={BODY_X} cy={BODY_Y} rx={40} ry={15} fill={fill} stroke={line} strokeWidth={1.2} />
        <path d={`M 128 ${BODY_Y + 4} q -8 10 -16 8`} fill="none" stroke={line} strokeWidth={1} />
        <circle cx={138} cy={BODY_Y - 4} r={2.2} fill={line} />
      </svg>
      {label && <figcaption className={styles.label}>{label}</figcaption>}
    </figure>
  );
}
