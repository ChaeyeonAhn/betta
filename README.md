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
| `pnpm dev`        | Next.js on http://localhost:3000 + socket relay on port 4000.                |
| `pnpm dev:mobile` | Next.js over HTTPS on all interfaces + socket relay on port 4000. For phones. |
| `pnpm build`      | Production build.                                                            |
| `pnpm typecheck`  | `tsc --noEmit`.                                                              |

`pnpm dev:mobile` generates a self-signed certificate into `certificates/` on first run. On the phone, open both `https://<laptop-ip>:3000` and `https://<laptop-ip>:4000` once and pass the warning.
