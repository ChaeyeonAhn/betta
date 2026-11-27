# betta

## Setup

Requires Node.js 24+ and pnpm.

```bash
pnpm install
pnpm dev
```

## Scripts

| Script            | What it does                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`        | Next.js on http://localhost:3000 + betta server on port 4000.                |
| `pnpm dev:mobile` | Next.js over HTTPS on all interfaces + betta server on port 4000. For phones. |
| `pnpm dev:tunnel` | Next + betta server behind two Cloudflare quick tunnels. Phones on any network. |
| `pnpm deploy:server` | Push `server/` + `lib/` to the EC2 box over SSM and restart it.         |
| `pnpm build`      | Production build.                                                            |
| `pnpm server`     | Betta server alone (`node server/index.ts`).                                 |
| `pnpm typecheck`  | `tsc --noEmit`.                                                              |

`pnpm dev:mobile` generates a self-signed certificate into `certificates/` on first run. On the phone, open both `https://<laptop-ip>:3000` and `https://<laptop-ip>:4000` once and pass the warning.

## Routes

- `/screen?room=betta` — projection. Keys: `1`/`2` mode A/B, `Space`/`→` next stage, `R` reset, `H` hide HUD.
- `/phone?room=betta` — what visitors open on their phones.

Phones can't reach the laptop on school Wi‑Fi or an iPhone hotspot. Use `pnpm dev:tunnel` (needs `cloudflared`) and open the `phone` URL it prints. Env read at request time: `SOCKET_URL` (betta server). The join QR on the screen is the static `public/qr-code.svg`; regenerate it if the phone URL changes.

Plan: `docs/plan.md`.

## Deploy

| Part | Where | How |
| --- | --- | --- |
| Next.js pages | Vercel, https://betta-sigma.vercel.app | `vercel deploy --prod` |
| betta server | EC2 Seoul (t4g.micro), https://3-37-110-43.sslip.io | `pnpm deploy:server` |

- The server box has no SSH port; `scripts/deploy-server.sh` goes through AWS Systems Manager. Needs `aws login --profile betta --region ap-northeast-2`.
- Caddy on the box terminates HTTPS (Let's Encrypt for the `sslip.io` name) and proxies to the server on :4000. Provisioning: `server/ec2/setup.sh`.
- Server env (`/etc/betta.env`, written by the deploy script): `ADMIN_KEY` from `.env.local`, `ALLOWED_ORIGINS` = the Vercel URL.
- Vercel env: `SOCKET_URL` = the EC2 URL.
- Projection: `https://betta-sigma.vercel.app/screen?key=<ADMIN_KEY>`. Without the key the screen is read-only.
- Why not Railway: KAIST DNS returns SERVFAIL for `*.up.railway.app`, so phones on campus Wi‑Fi couldn't reach it.
