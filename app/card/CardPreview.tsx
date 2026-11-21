"use client";

import { useEffect, useState } from "react";
import { BettaCard } from "@/app/phone/card/BettaCard";
import type { Genome } from "@/lib/protocol";

export function CardPreview() {
  // Random on the client only, so the server render never disagrees with it.
  const [sample, setSample] = useState<{ genome: Genome; id: string } | null>(null);
  useEffect(() => {
    const r = Math.random;
    setSample({
      id: `preview-${r().toString(36).slice(2, 8)}`,
      genome: { hue: r(), saturation: r(), finLength: r(), boundary: r(), sociability: r() },
    });
  }, []);
  if (!sample) return <main style={{ position: "fixed", inset: 0, background: "#000" }} />;
  return <BettaCard genome={sample.genome} playerId={sample.id} name="preview" />;
}
