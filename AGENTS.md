# AGENTS.md

Rules for coding agents in this repository. Read this first.

## Stack

Next.js 16 App Router, TypeScript, CSS Modules, MDX. pnpm, Node 24+. `three` via `@react-three/fiber` + `@react-three/drei`. `socket.io`. `tone`. `@mediapipe/tasks-vision`. No Tailwind, styled-components, state library or UI kit unless asked.

## Map

```
app/
  page.tsx  layout.tsx  globals.css      site shell
  <route>/page.tsx                       one folder per route
  api/<name>/route.ts                    server endpoints, secrets from .env.local
hooks/
  shared/useSocket.ts                    useSocket(room, onMessage) → { send, connected }
socket-server.mjs                        Socket.IO relay on :4000. join(room); message({type,data}) → the rest of the room
public/                                  static assets, mirroring app/
```

## Always

- `pnpm typecheck` passes before you say you are done. `pnpm build` passes before a push.
- Check the route in the browser. The user usually has `pnpm dev` on http://localhost:3000; do not start a second server on that port. Phones use `pnpm dev:mobile`.
- Do what was asked, in the files asked about. No unrelated refactors, renames or cleanup.
- Never print or commit `.env*` or `certificates/`. Never `NEXT_PUBLIC_` a secret.
- Next.js APIs may differ from your training data: read `node_modules/next/dist/docs/` before writing Next-specific code. App Router, not Pages Router.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
