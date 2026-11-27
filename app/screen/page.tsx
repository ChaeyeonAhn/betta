import { DEFAULT_ROOM } from "@/lib/protocol";
import { Screen } from "./Screen";

export const metadata = { title: "betta · screen" };

// The projection. Open on the laptop: /screen?room=betta&key=<ADMIN_KEY>
//
// Env, read per request (no restart of the client bundle needed):
//   SOCKET_URL  betta server URL. Default: same host, port 4000.
export default async function ScreenPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const room = typeof params.room === "string" ? params.room : DEFAULT_ROOM;
  const adminKey = typeof params.key === "string" ? params.key : undefined;

  return (
    <Screen
      room={room}
      adminKey={adminKey}
      socketUrl={process.env.SOCKET_URL ?? null}
    />
  );
}
