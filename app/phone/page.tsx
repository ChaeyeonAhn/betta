import { DEFAULT_ROOM } from "@/lib/protocol";
import { Phone } from "./Phone";

export const metadata = { title: "betta" };

// What visitors open from the QR code: /phone?room=betta
// SOCKET_URL (read per request) points phones at the betta server, e.g. a tunnel.
export default async function PhonePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const room = typeof params.room === "string" ? params.room : DEFAULT_ROOM;
  return <Phone room={room} socketUrl={process.env.SOCKET_URL ?? null} />;
}
