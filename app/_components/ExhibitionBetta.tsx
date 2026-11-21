import { BettaPreview } from "@/app/phone/BettaPreview";

// The cover fish is a specimen of the same model visitors create inside.
const specimen = { hue: 0.016, saturation: 0.94, finLength: 1, boundary: 0.7, sociability: 0.44, markings: 0.86 };

export function ExhibitionBetta() {
  return <BettaPreview genome={specimen} playerId="betta-cover" width={650} />;
}
