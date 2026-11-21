"use client";

// The betta gliding slowly on the phone's card. Framed like CardSnapshot (same view
// height and size), so the saved still sits where the live fish swims.

import { BettaCanvas } from "@/app/screen/scenes/BettaCanvas";
import { BettaModel } from "@/app/screen/scenes/BettaModel";
import type { Genome } from "@/lib/protocol";
import { CARD_FISH_SIZE } from "./composeCard";

export function CardFish({ genome, playerId }: { genome: Genome; playerId: string }) {
  return (
    <BettaCanvas viewHeight={182} dpr={[1, 2]} background={null}>
      <BettaModel genome={genome} seed={playerId} size={CARD_FISH_SIZE} calm="drift" />
    </BettaCanvas>
  );
}
