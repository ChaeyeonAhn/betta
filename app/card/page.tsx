import { CardPreview } from "./CardPreview";

export const metadata = { title: "betta · card" };

// /card: one betta card on black, for checking the card without a round.
// A new random betta on every load.
export default function CardPage() {
  return <CardPreview />;
}
