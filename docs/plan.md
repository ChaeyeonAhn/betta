# Betta Project — Implementation Plan v2

> v0 written 2026-11-18, v1 revised after review the same day. v2 (2026-11-21) is in English and matches the code. v2.1 (same day): Mode A redesigned around the growing betta, born fills the grid, betta card at the end of open.
> Sources: pitch deck (Team3_ChaeyeonAhn_FinalProject.pdf), Notion "Final Project idea / plan" (latest), "Betta project" and "Summary" (latest wins where they overlap).
> Goal: **a skeleton demo of the full flow by 11/23.** Everything from joining to the shared tank must run end to end over sockets. Visuals can stay rough.

## 0. Decisions

| Topic | Decision |
| --- | --- |
| Betta creation input | **Both modes A and B are built**, switched with an admin key in the lobby. A = 45s: the betta grows from a fry at the top of the phone while the visitor uses a fake SNS app below; every action sends a bubble up that shapes it (§2-3). B = 8 questions answered on a 0–10 dial pad, the whole room on the same question. |
| Breaking the partitions | **Everyone pushes together.** The room's taps add up; the walls fall when the total crosses a threshold. Falls on its own when the time limit runs out. |
| Fighting | **No fighting.** Bettas relate only by drifting together or keeping their distance. The genome's `aggression` axis was replaced by **`boundary`**. |
| Ending | **None for the tank.** `open` is the exhibition loop: late visitors join, and the bettas of visitors who left fade out (§1-1). **Each visitor** steers for 90s, then their phone shows a **betta card** to save or share; their betta stays in the tank. |
| 11/23 scope | Full flow skeleton. Intro video and sound are left as slots. |
| Hosting | **Cloud.** Next.js → Vercel (`betta-sigma.vercel.app`), socket server → **EC2 Seoul** (`3-37-110-43.sslip.io`, Caddy HTTPS). Railway was dropped because KAIST DNS can't resolve `*.up.railway.app`. Local dev still works (`pnpm dev`, `dev:mobile`, `dev:tunnel`). Socket and phone URLs come from runtime env (`SOCKET_URL`, `PUBLIC_URL`). |
| Projection | **Fixed 1920 × 602 stage** (about 3.2 : 1). `Screen.tsx` letterboxes it into the window; a "Projection size" panel adjusts width and height by hand. |
| Visitor-facing copy | **English.** |

## 1. Experience flow = state machine

```
lobby ──▶ input ──▶ born ──▶ grid ──▶ open ⟲ (no end)
 (join)   (A or B)  (birth)  (cages)  (one tank)
```

| stage | Projection (`/screen`) | Phone (`/phone`) | Next |
| --- | --- | --- | --- |
| `lobby` | Only the join QR, floating in the water | No words: turn the phone to look around the water; a rocking-phone icon every 3s | Admin key |
| `input` | A: the grid; each betta fades in (with its cube) in a random front cell as soon as its visitor releases it. B: the current question, 0/10 scale, answered count | A: growing betta + fake SNS app (45s), then swipe up to release. B: question + dial pad + live preview of my betta | A: everyone in the round released → `born`. B: advances by itself once everyone answered (950ms reveal), last question → `born` |
| `born` | The grid, empty at first. Each betta fades in with its cube in a random front cell as it is released. Once everyone is in, grey placeholder bettas fade in with their cubes while the camera pulls back to 2.2× its distance: the cells in view first (empty front cells leading), then each cube as it comes into the frame, so the tank keeps growing at its edges (14s); the huge full grid holds for 20s, and the camera eases back in for `grid` | My betta in the middle; the camera pulls back to show its cube in a grid; a swipe-up icon; swipe to release; then the phone **is** the betta, inside its cell (§2-3c) | Auto after the fill + 20s hold. Admin `Space`: start the fill now / skip the hold |
| `grid` | Same lattice, every cell full; cracks spread over the real bettas' cells with taps; a tapping-finger icon over the shared gauge | Still inside the cell: tap anywhere to push on the front glass, which cracks; a hairline shared gauge | Shared total ≥ threshold, or 60s timeout (server decides) |
| `open` | The empty grid fades away (2.2s) over the open tank; each betta drifts out of its own cell and swims in one 3D tank; a steering icon until every phone shows its card | A bare console (one ring, one dot) for 90s, then the betta card (Save / Share) | None (admin reset only) |

Admin keys on `/screen` (only with `?key=<ADMIN_KEY>` when the server has one): `1`/`2` mode A/B (lobby only), `Space`/`→` next stage or next question, `Shift+Space` skip the questions to `born`, `R` reset, `P` drop disconnected phones, `H` hide HUD.

### 1-1. Endless open: joining and leaving

- **Late visitors**: joining after `lobby` puts the phone straight into `input` alone. In B they answer the questions at their own pace; the room keeps going. A betta released before the placeholders start filling still gets a grid cell; later ones have no cell and enter the tank from a side edge in `open` (and get their 90s from then).
- **Stalls**: a betta that is made but not released within 30s is released by the server, so one idle phone doesn't hold up the fill.
  - Not built yet: the single cube a late betta should break out of on its own (lower threshold, own timeout).
- **Leaving**: a phone that disconnects before it has a betta is dropped at once (B keeps dial progress across a reconnect). With a betta, it goes to `fading` in `open` and is removed after 3 minutes. Reconnecting in time brings it back.
  - Not built yet: the visual fade on the screen.
- **Admin reset**: for demos. One round of A → reset → one round of B. Reset keeps connected phones and clears what they did.

## 2. Architecture

```
 Phones ─┐                                ┌─ Projection screen (/screen)
 /phone  ├── Socket.IO ── session server ─┤
         ┘   (EC2 :4000 behind Caddy,     └─ (admin = keyboard on the screen)
              or the laptop in dev)
      Next.js on Vercel (or the laptop :3000 in dev)
      Phones that can't reach the laptop: pnpm dev:tunnel (Cloudflare quick tunnels)
```

**The server owns the session; the screen owns the physics.**

- **Server (authoritative)**: stage, mode, players, each player's raw input and genome, the shared effort, timers, the shared question index. **Genomes are computed on the server only.** A sleeping phone or a reloaded screen recovers from the next `state`.
- **Screen**: betta positions, schooling, personal space, water current, rendering. The server doesn't know positions; it only relays steering.
- **Phone**: input device. `playerId` lives in localStorage, so a reconnect returns to the same betta.

The server runs with Node 24 type stripping (`node server/index.ts`). It imports `lib/protocol.ts`, `lib/genome.ts`, `lib/questions.ts` and `lib/lan.ts` at runtime, so those use `.ts` import paths (`allowImportingTsExtensions`) and only erasable TypeScript (no enums).

### 2-1. `Genome`: one type for both modes

Everything after `input` works the same whichever mode made the genome.

```ts
type Genome = {
  hue: number;          // 0–1 body colour, cool → warm
  saturation: number;   // 0–1 how ornate = how curated (selectively bred)
  finLength: number;    // 0–1 fins = wanting to be seen
  boundary: number;     // 0–1 personal space radius (partitioned tank)
  sociability: number;  // 0–1 pull toward similar bettas
  markings?: number;    // 0–1 body and fin pattern          (B only)
  reactivity?: number;  // 0–1 how quickly the wander turns   (B only)
  glide?: number;       // 0–1 how wide the idle wander is    (B only)
};
```

The three optional axes default to 0.5 where they are read. `genomeDistance` (used for schooling) still looks only at the first five.

### 2-2. Mode B: 8 questions, 0–10 (`lib/questions.ts`)

0 = "Not at all", 10 = "Very much". Mapping: `value / 10` (unanswered = 5). The phone shows a live preview that grows more complete with each answer, and after sending says which trait the answer shaped.

| # | Question | Axis | Shown as |
| --- | --- | --- | --- |
| 1 | Do you edit your photos or captions several times before you post? | `saturation` | colour intensity |
| 2 | Do you often post your everyday life on social media? | `finLength` | tail fin length |
| 3 | Do you tap on posts about topics you don't usually care about? | `hue` (`0.62 − v × 0.59`) | body colour |
| 4 | Do you post again in a format that got a good response? | `markings` | body and fin markings |
| 5 | When a stranger sends you a follow request, do you check their account first? | `boundary` | personal space |
| 6 | Do you often like or comment on your friends' posts? | `sociability` | pull toward other bettas |
| 7 | When a notification pops up, do you stop what you're doing to check it? | `reactivity` | quickness of movement |
| 8 | When you open your feed, do you scroll fast instead of reading each post? | `glide` | swimming range |

The whole room answers the same question, shown on the projection. When every connected participant has answered, it moves on by itself; the admin can also push it. Wording is up for review.

### 2-3. Mode A: the betta grows above the feed (`lib/feed.ts`, `app/phone/modes/FakeFeed.tsx`)

Why: in v0 the visitor never saw the betta while playing, so the fish in `born` felt like a result, not something they made. Now they watch their habits shape it.

- **Layout**: the top 28% of the phone is the betta's water; a fry grows into a full betta over **45s** (`BettaModel` `growth`: smaller, shorter fins, paler colour at the start). The bottom is the SNS app (**Bettagram**), pitch black with white lines, to sit in the same deep ocean.
- **Bubbles**: every logged event lets a bubble go from where it happened (the touch point; the banner that timed out, fainter and slower; the post that scrolled away) up to the fish. When it arrives, a ring spreads from the fish and that event is added to the phone's preview genome (`genomeFromFeed` on the events that have landed). The server computes the real genome from the same events, so phone and projection end up the same. At 45s the app dims, the last bubbles land (≤2.6s), then the phone sends `done`.
- **Feed**: a scrolling feed (8 posts × 3; each photo is an empty white-line frame, no drawn placeholder). 30 banners over 45s (the 24 notices come round again near the end), gaps shrinking from ~4s to ~1s. A banner not touched within 4s counts as `ignore`. Tapping a banner opens a card with reactions (Like / Accept · Decline / Reply / Close). "+ Post" at the bottom.
- Then the phone shows the grown betta alone in the middle; the camera pulls back and it turns out to be in a cube, one cell of a grid (`ReleaseScene.tsx`), and a swipe-up icon appears. Swiping lifts it off the top of the phone; it fades into a random cell on the projection right away. No status text on either side (no "growing" captions).
- Tags: `brag` `mood` `friend` `stranger` `self`. The phone sends event batches every second.

| Axis | Behaviour observed |
| --- | --- |
| `hue` | dwell-weighted average hue of the mood posts |
| `saturation` | attention to `brag` posts (dwell, likes, taps) vs everything else |
| `finLength` | opening `self` notifications, pressing "+ Post" |
| `boundary` | declining or ignoring `stranger` requests vs accepting |
| `sociability` | answering `friend` notifications vs ignoring everything |

### 2-3b. born: filling the grid (`app/phone/Release.tsx`, `app/screen/scenes/Grid.tsx`)

- The phone shows my betta (3D preview). Bettas carry no name tag anywhere except the card. Swiping up (or the button) sends it off the top of the phone. The server gives it a **random free front cell** (`slot`) of `createGridLayout(gridSize)` (`lib/gridLayout.ts`, shared with the server).
- The projection starts as empty water: no cubes, no fish. A released betta **fades in together with its cube** (`GridTank` `VisitorCell`/`FadeIn`, 1.6s).
- When every connected visitor in the round is in, the server sets `fillAt` and the deadline `fillAt + FILL_MS (14s) + FILL_HOLD_MS (20s)`. Placeholder bettas fade in with their cubes: the empty front cells first, then each row behind (shuffled within a row), slow at first and quickening. ~390 cubes, so their lines are one `LineSegments` and their fish two instanced draws; each carries a delay and the fade runs in the shaders. After the hold the stage moves to `grid` on its own.
- `Grid.tsx` draws input (A), born and grid with one WebGL tank, so nothing remounts between them. `gridSize` only grows during a round, so cells keep their place.

### 2-3c. grid · open

- **Visual**: the bettas are 3D (`BettaModel`, procedural mesh in `bettaMesh.ts`, UV atlas texture `/betta-uv.webp`, `bettaMaterial.ts`). The water is a shader of moving surfaces and scattered light (`PaintedWater`, `waterSurfaces.ts`; the modelled light shafts were removed 11/21), the same "bottomless ocean" across born, grid and open. The SVG `BettaShape` remains as a fallback without WebGL.
- **Inside the cell, on the phone** (`app/phone/Cell.tsx`, `GridTank` `pov`, `useDeviceLook.ts`): from release until the walls break, the phone renders the same grid (same layout, slots, seeded placeholders and fill clock) from inside its own cell, without its own fish. The betta faces **out of the grid, toward the room**, so turning the phone right looks toward −x: the cells to its left on the projection, as a fish looking back at the room would see them. Yaw is a full turn (behind it, the grid goes on), pitch ±70°, both relative to how the phone was held at first; without a sensor (desktop, plain http) dragging looks around. The water shader follows the turning camera (`PaintedWater` `followCamera`), so the sea continues all round.
- **grid** (`Grid.tsx`, `GridTank.tsx`, `GridFillerFish.tsx`): wide-angle 3D lattice, every cell full (real bettas + placeholders). Each tap (anywhere on the phone's cell view) cracks my cell: the same seeded cracks (`cracks.ts`) on the projection and on the phone's front glass, seen from inside. Threshold = bettas × 30 taps; the total leaks 2 taps/s per connected betta; 60s timeout.
- **Icons, not words** (`app/_components/Hint.tsx`): a white-line icon fades in every 3s and acts out what to do: `turn` (phone rocking: lobby, inside the cell), `tap` (finger: grid, phone and projection), `steer` (dot circling a ring: open on the projection).
- **open** (`Open.tsx`, `WaterTank.tsx`, `waterCurrent.ts`, `app/phone/controls/Joystick.tsx`): the grid's cubes and placeholders fade away over the tank (`Screen.tsx` keeps a fishless `Grid leaving` on a clear background for 2.2s; each visitor's betta in it hands over to its open-tank copy in 0.7s), and each betta drifts slowly out of its own cell into a tank with depth. The console (one ring and a dot on black; −1…1, ~20Hz) is the strongest force. Late bettas enter from a side edge.
- **Betta card** (`app/phone/card/`): 90s after a visitor enters `open` (`openUntil`), the joystick is replaced by their card. A hidden canvas renders the betta once (`CardSnapshot`), `composeCard` draws a 1080 × 1350 PNG (black, white lines, the betta, tag, date, trait lines from `traits.ts`). Save downloads it; Share uses the Web Share API with the file (on iOS Save also goes through the share sheet, which has "Save Image"). Same card for A and B.

### 2-4. Behaviour in open (built)

- Steering: while held, velocity is pulled toward the joystick direction.
- Wander when not steered; `reactivity` makes it turn more often, `glide` makes it wider.
- Personal space radius = `70 + boundary × 160` px (3D distance). Others inside it get pushed away, harder for high `boundary`.
- Schooling: within 480px, bettas with `genomeDistance < 0.7` attract and match velocity, scaled by `sociability`.
- Soft walls at the stage edges. Each betta keeps a preferred depth. A shared water current, stirred by the swimmers, carries everyone.
- No fighting, no collisions as drama.
- Not built yet: **colour bleed** (bettas that stay close slowly tint each other; visual only, genome unchanged).

### 2-5. Socket protocol (`lib/protocol.ts`)

| Direction | Event | Payload |
| --- | --- | --- |
| phone → server | `hello` | `{ role: "phone", room, playerId }` |
| phone → server | `answer` (B) | `{ q, value }` (0–10) |
| phone → server | `feed` (A) | `{ events: FeedEvent[], start?, done? }` |
| phone → server | `release` | — |
| phone → server | `effort` | `{ amount }` (clamped to 0–3) |
| phone → server → screen | `steer` | `{ x, y }`, relayed with `playerId`; server only relays |
| screen → server | `hello` | `{ role: "screen", room, adminKey? }` |
| screen → server | `admin` | `setMode` / `next { question? }` / `goto` / `reset` / `prune` |
| server → all | `state` | `SessionState`: `{ room, stage, mode, players[], effort{total, threshold}, deadline, fillAt, gridSize, question }` (throttled to 100ms) |
| server → phone | `rejected` | `{ reason }` (wrong room) |

- `players[]`: `{ id, connected, phase, done, genome, released, slot, openUntil, effort }`. A phone's own entry also carries `question` (index, answered, live preview genome).
- `SessionState` also has `fillAt` (born: when the placeholders started) and `gridSize` (the player count the grid layout is built for).
- `phase`: `waiting` / `input` / `caged` / `free` / `fading`. Players can be in different phases because of late joiners.

## 3. Files

```
app/
  page.tsx                   landing: just the links to /phone and /screen over the water
  _components/               BettaShape (SVG fallback), ExhibitionBetta (cover), PaintedWater + water shaders, Hint (icons)
  screen/
    page.tsx  Screen.tsx     projection, admin keys, lobby/question overlay
    ProjectionControls.tsx   projection size calibration
    scenes/                  Grid (input A + born + grid; + GridTank, GridFillerFish, cracks), Open (+ WaterTank),
                             BettaCanvas, BettaModel, bettaMesh, bettaMaterial,
                             gridLayout, waterCurrent, swimmingPitch
  phone/
    page.tsx  Phone.tsx      phone UI switch by stage/phase
    BettaPreview(.Scene)     3D preview of my betta
    LookAround.tsx           lobby: look around the water by turning the phone
    Release.tsx              born: swipe up to release
    Cell.tsx                 after release until open: inside my cell (first person)
    useDeviceLook.ts         orientation sensor → yaw/pitch, drag fallback, taps
    modes/                   FakeFeed (A), QuestionDial (B)
    controls/                Joystick (open)
    card/                    BettaCard, CardSnapshot, composeCard, traits (end of open)
lib/
  protocol.ts                events and state types (server + pages)
  genome.ts                  A/B → Genome, distance (runs on the server)
  questions.ts               Mode B questions
  feed.ts                    Mode A posts and notifications
  gridLayout.ts              stage size + grid cells (screen and server)
  playerId.ts  lan.ts
hooks/useBetta.ts            socket connect + state subscription
server/
  index.ts                   Socket.IO session server, stage machine
  ec2/setup.sh               one-time EC2 setup
scripts/
  deploy-server.sh           pnpm deploy:server
  dev-tunnel.mjs             pnpm dev:tunnel
```

Not created yet: `scripts/bots.ts` (N fake phones for a 15–20 person test alone).

## 4. Schedule (11/18 → 11/23)

| Date | Work | Status |
| --- | --- | --- |
| 11/19 | protocol, server stage machine, room code, dev scripts; Mode A v0; born; grid + open v0; Vercel + EC2 deploy | Done |
| 11/20 | Mode B dial pad, 3D wide-angle grid, phone preview matching the screen betta | Done |
| 11/21 | 3D bettas in all stages, shader water, English copy, plan v2; Mode A redesign (growing betta, bubbles), random cells + placeholder fill, betta card | Done |
| 11/22 | Real-device check of Mode A and the card (iOS share sheet), late-joiner single cube, fade-out on leave | Next |
| 11/23 | `bots.ts` with 15–20 phones, real iOS and Android devices, leave → fade, repeated resets | Demo: one round of A + one round of B without breaks |

If time runs short, drop in this order: colour bleed → late-joiner single cube (join only in the lobby instead) → number of axes Mode A covers.

## 5. Risks / notes

- **Networks**
  - Campus Wi‑Fi blocks device-to-device traffic (AP isolation, confirmed 11/18). An iPhone hotspot doesn't work either (IPv6-only; the laptop gets a fake IPv4 `192.0.0.2` via clat46).
  - With the cloud deploy, phones only need internet. For local tests: `pnpm dev:tunnel` (two Cloudflare quick tunnels, new URLs every run, open to anyone who knows them), or an Android hotspot / travel router.
  - `dev:mobile` uses a self-signed cert: each phone has to open `:3000` and `:4000` once and pass the warning.
- **Server redeploy = session reset.** State is in memory only; don't redeploy during the exhibition.
- **Room code and admin key**: the server rejects other rooms; admin commands need `ADMIN_KEY` (`/screen?key=…`). Without it the screen is read-only. CORS allows only `ALLOWED_ORIGINS` (the Vercel URL).
- **Load**: `state` is broadcast at most every 100ms. Each 3D betta is its own mesh; check frame rate on the projection machine with 20+ bettas.
- **Orientation sensor** needs HTTPS (the Vercel URL; not the LAN `http://` dev URL) and, on iOS, a tap to grant motion access: the first tap on the phone asks. Nothing on screen says to tap, so an iPhone that never taps in the lobby only gets to look around once it taps in the cell. Check on real devices, along with the frame rate of the cell view (hundreds of placeholder cubes + every visitor's betta) on mid-range phones.
- **Haptics**: `navigator.vibrate` works on Android Chrome only.
- **Next 16.4.3 security notice**: check for a patch release before the exhibition.

## 6. Backlog after the demo

- Intro video (polish the existing video 1 with AI)
- Sound: Tone.js ambience (low hum, neutral) + bubble samples with PitchShift/Distortion, different per genome
- Water affecting behaviour: rules where the space changes how bettas move
- Labyrinth organ: rising to the surface to breathe = "stepping off the network"
- Running totals: "today this tank holds n% of this kind of betta" (no ending, a quiet corner display)
- Projection mapping (see ID412 W3 experiment)

## 7. Open decisions

- [x] **Mode A redesign**: the betta grows above the feed; bubbles carry each action to it (§2-3)
- [ ] Mode B question wording (§2-2)
- [ ] Mode A copy; whether 30 banners over 45s feels right
- [ ] Card wording (`app/phone/card/traits.ts`) and whether the 90s in open is the right length
- [ ] Effort threshold, timeout, fade time: settle by running it with real people
- [ ] Exhibition date, projector resolution and aspect, expected maximum visitors
- [ ] Connection on the exhibition day: cloud (current) vs local router fallback
- [x] Phone → laptop on the demo Wi‑Fi: doesn't work → cloud deploy / `dev:tunnel`
- [x] Cloud move: done 11/19 (Vercel + EC2)
