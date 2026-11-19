// `pnpm dev:tunnel`: Next + betta server on this laptop, reachable from any
// phone with internet through two Cloudflare quick tunnels (no account, real
// https certificates). For networks where phones can't reach the laptop
// directly (school Wi‑Fi, iPhone hotspot).
//
// Needs `cloudflared` (brew install cloudflared). The tunnel URLs change every run.
// Anyone with the URL can open it, so stop it (Ctrl+C) when you are done.

import { spawn } from "node:child_process";

const NEXT_PORT = Number(process.env.NEXT_PORT) || 3000;
const SERVER_PORT = Number(process.env.SERVER_PORT) || 4000;
const ROOM = process.env.ROOM || "betta";

const children = [];

function start(name, command, args, env = process.env) {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const print = (buffer) => {
    for (const line of buffer.toString().split("\n")) if (line.trim()) console.log(`[${name}] ${line}`);
  };
  child.stdout.on("data", print);
  child.stderr.on("data", print);
  return child;
}

/** Starts a quick tunnel to localhost:port and resolves with its public URL. */
function tunnel(port) {
  return new Promise((resolve, reject) => {
    const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    const find = (buffer) => {
      // Quick tunnel hosts are hyphenated words; this skips api.trycloudflare.com in the logs.
      const match = buffer.toString().match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/);
      if (match) resolve(match[0]);
    };
    child.stdout.on("data", find);
    child.stderr.on("data", find);
    child.on("error", () => reject(new Error("cloudflared not found. brew install cloudflared")));
    child.on("exit", (code) => reject(new Error(`cloudflared for :${port} exited (${code})`)));
    setTimeout(() => reject(new Error(`no tunnel URL for :${port} after 30s`)), 30_000);
  });
}

function stopAll() {
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

console.log("opening tunnels…");
let web, socket;
try {
  [web, socket] = await Promise.all([tunnel(NEXT_PORT), tunnel(SERVER_PORT)]);
} catch (error) {
  console.error(String(error.message ?? error));
  stopAll();
  process.exit(1);
}

const env = { ...process.env, PUBLIC_URL: web, SOCKET_URL: socket, ROOM };
start("server", "node", ["--watch", "server/index.ts"], { ...env, PORT: String(SERVER_PORT) });
const { PORT: _ignored, ...nextEnv } = env;
start("next", "./node_modules/.bin/next", ["dev", "-p", String(NEXT_PORT)], nextEnv);

console.log(`
  phone   ${web}/phone?room=${ROOM}
  screen  http://localhost:${NEXT_PORT}/screen?room=${ROOM}   (shows the phone link)
  socket  ${socket}

  New tunnel URLs can take ~10s before they resolve. Ctrl+C stops everything.
`);
