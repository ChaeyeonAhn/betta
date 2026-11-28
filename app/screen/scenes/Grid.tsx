"use client";

import { useMemo, useState } from "react";
import { BettaShape } from "@/app/_components/BettaShape";
import { iconAspect, iconUrl } from "@/app/_components/surfaceIconImages";
import { Hint } from "@/app/_components/Hint";
import type { PlayerView, SessionState } from "@/lib/protocol";
import { BettaVisual } from "./BettaCanvas";
import styles from "./Grid.module.css";
import { createGridLayout } from "./gridLayout";
import { crackLines } from "./cracks";
import { REACTION_MS, type GridReactionEvent } from "./GridReaction";
import { FRY_GENOME, GridTank } from "./GridTank";

/** During the handoff to the open tank, the last lattice fades over the freed fish. */
export function Grid({ state, leaving = false, reactions }: {
  state: SessionState;
  leaving?: boolean;
  reactions?: GridReactionEvent[];
}) {
  const walls = state.stage === "grid";
  const layout = useMemo(() => createGridLayout(state.gridSize), [state.gridSize]);
  const { slots, side } = layout;
  const bettas = state.players.flatMap((player) =>
    player.slot !== null && player.slot < slots.length ? [{ ...player, slot: player.slot }] : []);
  const share = state.effort.threshold ? Math.min(1, state.effort.total / state.effort.threshold) : 0;

  return (
    <section className={styles.root} data-leaving={leaving}>
      <BettaVisual fallback={leaving ? null : slots.map(({ x, y }, i) => {
        const player = bettas.find((p) => p.slot === i);
        return (
          <div
            key={i}
            className={`${styles.cell} ${styles.fallback}`} data-occupied={!!player}
            style={{ left: x - side / 2, top: y - side / 2, width: side, height: side }}
          >
            {player && (
              <>
                <div className={styles.fallbackFish} data-fry={!player.genome}>
                  <BettaShape genome={player.genome ?? FRY_GENOME} size={side * 0.78} />
                </div>
                {reactions?.filter(({ playerId }) => playerId === player.id).map((reaction) => (
                  <FallbackReaction key={reaction.id} reaction={reaction} side={side} />
                ))}
              </>
            )}
          </div>
        );
      })}>
        <GridTank players={bettas} layout={layout} reactions={reactions} leaving={leaving} />
      </BettaVisual>
      {walls && !leaving && bettas.map((player) => {
        const { x, y } = slots[player.slot];
        return (
          <div key={player.id} className={styles.cell} style={{ left: x - side / 2, top: y - side / 2, width: side, height: side }}>
            <Cracks player={player} side={side} />
          </div>
        );
      })}

      {walls && !leaving && (
        <footer className={styles.footer}>
          <Hint kind="tap" size={64} className={styles.hint} />
          <div className={styles.bar}>
            <div className={styles.fill} style={{ width: `${share * 100}%` }} />
          </div>
        </footer>
      )}
    </section>
  );
}

function FallbackReaction({ reaction, side }: { reaction: GridReactionEvent; side: number }) {
  const [elapsed] = useState(() => performance.now() - reaction.at);
  if (elapsed >= REACTION_MS) return null;
  const width = Math.round(side * 0.25);
  return (
    <img
      className={styles.fallbackReaction}
      src={iconUrl(reaction.kind)}
      alt=""
      width={width}
      height={Math.round(width / iconAspect(reaction.kind))}
      style={{
        left: `${50 + (reaction.id % 3 - 1) * 10}%`,
        animationDelay: `-${elapsed}ms`,
        animationDuration: `${REACTION_MS}ms`,
      }}
    />
  );
}

/** Crack lines that grow with this player's taps (cracks.ts, shared with their phone). */
function Cracks({ player, side }: { player: PlayerView; side: number }) {
  const lines = crackLines(player.id, player.effort);
  if (!lines.length) return null;
  return (
    <svg className={styles.cracks} width={side} height={side} aria-hidden>
      {lines.map((line) => {
        const d = line.map(([x, y], k) => `${k ? "L" : "M"} ${(x * side).toFixed(1)} ${(y * side).toFixed(1)}`).join(" ");
        return <path key={d} d={d} fill="none" stroke="#e8e8e8" strokeWidth={1} strokeOpacity={0.7} />;
      })}
    </svg>
  );
}
