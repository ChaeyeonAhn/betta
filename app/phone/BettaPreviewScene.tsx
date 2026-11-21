"use client";

import { BettaShape } from "@/app/_components/BettaShape";
import { BettaCanvas, BettaVisual } from "@/app/screen/scenes/BettaCanvas";
import { BettaModel } from "@/app/screen/scenes/BettaModel";
import type { Genome } from "@/lib/protocol";

export function BettaPreviewScene({ genome, playerId, width, viewHeight = 182, growth }: {
  genome: Genome;
  playerId: string;
  width: number;
  viewHeight?: number;
  growth?: number;
}) {
  return (
    <BettaVisual fallback={<BettaShape genome={genome} size={width} />}>
      <BettaCanvas viewHeight={viewHeight} dpr={[1, 1.5]} background={null}>
        <BettaModel genome={genome} seed={playerId} size={112} growth={growth} />
      </BettaCanvas>
    </BettaVisual>
  );
}
