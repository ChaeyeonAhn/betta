# Betta Project — Implementation Plan v2

> v0 written 2026-11-18, v1 revised after review the same day. v2 (2026-11-21) is in English and matches the code. v2.1 (same day): Mode A redesigned around the growing betta, born fills the grid, betta card at the end of open. v2.2 (11/22): **Mode B removed**; the feed is the only input. The projection shows no text but the player count.
> v2.3 (11/27): the lobby is a landing page: white pool room, a heavy one-line title, a small join QR with the joined count under it, and SNS icons floating on the water that the camera dives past (§2-6).
> v2.4 (11/29) moves creation onto the projection. Each visitor uses the phone as a full-height feed, and their fish grows up in its own cell (§2-3).
> v2.5 (11/29): new players drop into the landing pool with a splash; feed reactions (scrolling included) rise slowly out of the top of the frame; the placeholder fill and camera pull-back are back in `born`; each cell breaks on its own and freed bettas help the others (§2-3c); the open tank picks every betta up where the grid left it and is steered by tilting the phone; any meeting leaves colour at once (§2-4).
> Sources: pitch deck (Team3_ChaeyeonAhn_FinalProject.pdf), Notion "Final Project idea / plan" (latest), "Betta project" and "Summary" (latest wins where they overlap).
> Goal: **a skeleton demo of the full flow by 11/23.** Everything from joining to the shared tank must run end to end over sockets. Visuals can stay rough.

## 0. Decisions

| Topic | Decision |
| --- | --- |
| Betta creation input | Visitors browse a mock SNS for 45 seconds after pressing OK. The existing behavioural genome determines the adult in their projection cell (§2-3). |
| Breaking the partitions | **Each cell on its own, then together.** A cell breaks at 30 taps; its betta swims out to the glass of another closed cell and its visitor helps break that one (tilting the phone picks which). The tank opens when the last cell breaks, or when the time limit runs out. |
| Fighting | **No fighting.** Bettas relate only by drifting together or keeping their distance. The genome's `aggression` axis was replaced by **`boundary`**. |
| Ending | **None for the tank.** `open` is the exhibition loop: late visitors join, and the bettas of visitors who left fade out (§1-1). **Each visitor** steers for 90s, then their phone shows a **betta card** to save or share; their betta stays in the tank. |
| 11/23 scope | Full flow skeleton. Intro video and sound are left as slots. |
| Hosting | **Cloud.** Next.js → Vercel (`betta-sigma.vercel.app`), socket server → **EC2 Seoul** (`3-37-110-43.sslip.io`, Caddy HTTPS). Railway was dropped because KAIST DNS can't resolve `*.up.railway.app`. Local dev still works (`pnpm dev`, `dev:mobile`, `dev:tunnel`). The socket URL comes from runtime env (`SOCKET_URL`). The join QR is the static `public/qr-code.svg`: regenerate it when the phone URL changes (`PUBLIC_URL` is no longer read). |
| Projection | **Fixed 1920 × 602 stage** (about 3.2 : 1). `Screen.tsx` letterboxes it into the window. Just under the display, outside it: the player count (`online/total`) and a "Projection size" panel for width and height, in the work's black-and-white mono style. `H` hides both. No other text. |
| Visitor-facing copy | **English.** |

## 1. Experience flow = state machine

```
lobby ──▶ input ──▶ born ──▶ grid ──▶ open ⟲ (no end)
 (join)   (feed)    (birth)  (cages)  (one tank)
```

| stage | Projection (`/screen`) | Phone (`/phone`) | Next |
| --- | --- | --- | --- |
| `lobby` | Landing (`app/screen/Landing.tsx`): white pool room, "SCAN TO DIVE INTO THE BETTA PROJECT", the join QR, the joined count; SNS icons float on the water (§2-6). `next` dives the camera into the water | No words: turn the phone to look around the water; a rocking-phone icon every 3s | Admin key |
| `input` | After the dive, a room-wide lattice with one grey fry per participating phone. An action produces an icon at that fish. Each completed adult stays in its cell. | Square invitation over a full-height feed. OK starts that visitor’s 45 seconds. The finished feed stays visible. | When the connected participants finish, hold the adults in `born`. |
| `born` | Everyone is grown: grey placeholder bettas fade into every other cell while the camera pulls back to 2.2× (14s), the full grid holds (8s), then the camera eases back in | Completed visitors see their feed. Later arrivals finish their own feed. | Auto after fill + hold, or admin advance → `grid` |
| `grid` | The same cages, no gauge (a tapping-finger icon only). Each cell cracks with taps and breaks on its own; its betta swims out to the glass of the cell its visitor helps | Inside the cell, tap the front glass. Once out: the helped cell's glass seen from outside; tap to crack it, tilt hard (or swipe) to move to the next closed cell | Last cell broken, or the 60s grid timer |
| `open` | The grid stays as it was until the open tank has drawn its first frame, then fades away (2.2s) over it; each betta swims on from exactly where the grid showed it (in its cell, or wherever it had swum to) in one 3D tank; a steering icon until every phone shows its card | Tilt console for 90s: tilt to steer, a dot in a ring shows the tilt like a spirit level; tap = recalibrate. Then the betta card (Save / Share) | None (admin reset only) |

Admin keys on `/screen` (only with `?key=<ADMIN_KEY>` when the server has one; shown nowhere): `Space`/`→` next stage, `Shift+Space` skip `input` to `born`, `R` reset, `P` drop disconnected phones, `H` hide the player count and size panel. `main[data-stage]` carries the stage for tests.

### 1-1. Endless open: joining and leaving

- **Late visitors** get their own OK prompt and feed clock. Those seated during creation appear as fry in available cells. Visitors joining the open tank complete the feed and enter from a side edge.
- **Completion** happens in the assigned cell when the feed ends. Everyone can see an individual adult while others continue creating.
  - A late visitor who finishes with no seat has no cell to break: in `grid` they help break the others' (Helper view). Not built yet: a single cube of their own to break out of.
- **Rejoining** with the same phone identity resumes its active feed and seat during the reconnect window. Disconnected phones do not block the group from advancing.
  - Not built yet: the visual fade on the screen.
- **Admin reset**: between rounds. Reset keeps connected phones and clears what they did.

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

- **Server (authoritative)**: stage, players, each player's raw input and genome, each cell's taps and who is helping which cell, timers. **Genomes are computed on the server only.** A sleeping phone or a reloaded screen recovers from the next `state`.
- **Screen**: betta positions, schooling, personal space, water current, rendering. The server doesn't know positions; it only relays steering.
- **Phone**: input device. `playerId` lives in localStorage, so a reconnect returns to the same betta.

The server runs with Node 24 type stripping (`node server/index.ts`). It imports `lib/protocol.ts`, `lib/genome.ts`, `lib/feed.ts`, `lib/gridLayout.ts` and `lib/lan.ts` at runtime, so those use `.ts` import paths (`allowImportingTsExtensions`) and only erasable TypeScript (no enums).

### 2-1. `Genome`

Five axes, all from the feed (`genomeFromFeed`, server only).

```ts
type Genome = {
  hue: number;          // 0–1 body colour, cool → warm
  saturation: number;   // 0–1 how ornate = how curated (selectively bred)
  finLength: number;    // 0–1 fins = wanting to be seen
  boundary: number;     // 0–1 personal space radius (partitioned tank)
  sociability: number;  // 0–1 pull toward similar bettas
};
```

`genomeDistance` (used for schooling) looks at all five. Mode B's extra axes (markings, reactivity, glide) went with it; the fish use their middle values.

### 2-3. Creating a betta in its cell

The phone shows a black, full-height mock SNS feed. A square white-outlined dialog says **Do whatever you want!** and offers **OK**. Until the visitor accepts, the feed is inert and the server clock, dwell measurements and notification schedule have yet to start. Each visitor gets the full 45 seconds.

The server keeps each visitor’s seat, start time and feed events for the round. An accepted action is attributed to the player bound to that socket. Passive dwell and unattended notices still contribute to the five genome axes below. A screen joining mid-round reconstructs the fish from the current state and displays subsequent reactions live.

| Axis | Behaviour observed |
| --- | --- |
| `hue` | dwell-weighted average hue of the mood posts |
| `saturation` | attention to `brag` posts (dwell, likes, taps) vs everything else |
| `finLength` | opening `self` notifications, pressing "+ Post" |
| `boundary` | declining or ignoring `stranger` requests vs accepting |
| `sociability` | answering `friend` notifications vs ignoring everything |

### 2-3b. Projection rendering rules

1. Reveal the full cage lattice as the camera finishes entering the water. Draw the empty cages too. Reserve one front cell per participant and put one neutral-grey fry at 30% of adult length inside it, including while their OK prompt is open.
2. Render an interaction at the acting fish’s position (`GridReaction.tsx`). Use the matching cut-out from the landing pool’s icon set, small (15% of a cell), preserve its aspect ratio and keep it facing the audience. It pops out and drifts up like a bubble (42px/s, swaying) all the way out of the top of the frame, toward the surface; it never fades in place.
3. Map likes to hearts, positive interest to a happy face, replies to messages and posts to share icons. An explicit rejection or dismissal uses its corresponding negative expression. **Just scrolling counts too**: dwell samples show a blank face (`serious`), at most one per 1.8s per visitor (server-side). Expired notifications have no visual effect. At most 240 icons at once; old reactions are discarded on a reset.
4. At completion, apply the genome computed from the visitor’s feed and ease from fry size and grey colour to the full adult over about one second. Keep the same fish identity and cell throughout. The phone can observe the finished feed until the group enters the wall-breaking stage.

### 2-3c. grid · open

- **Visual**: the bettas are 3D (`BettaModel`, procedural mesh in `bettaMesh.ts`, UV atlas texture `/betta-uv.webp`, `bettaMaterial.ts`). The water is a shader of moving surfaces and scattered light (`PaintedWater`, `waterSurfaces.ts`; the modelled light shafts were removed 11/21), the same "bottomless ocean" across born, grid and open. The SVG `BettaShape` remains as a fallback without WebGL.
- **Inside the cell, on the phone** (`app/phone/Cell.tsx`, `GridTank` `pov`, `useDeviceLook.ts`): while the walls can be pushed, the phone renders the same lattice and occupied slots from inside its own cell, without its own fish. The betta faces **out of the grid, toward the room**, so turning the phone right looks toward −x: the cells to its left on the projection, as a fish looking back at the room would see them. Yaw is a full turn (behind it, the grid goes on), pitch ±70°, both relative to how the phone was held at first; without a sensor (desktop, plain http) dragging looks around. The water shader follows the turning camera (`PaintedWater` `followCamera`), so the sea continues all round.
- **born · the fill** (`GridTank` `buildGrid`, `GridFillerFish`, `ProjectionCamera`): once every connected visitor is done, the server sets `fillAt` and the deadline `fillAt + FILL_MS (14s) + FILL_HOLD_MS (8s)`. Placeholders fade into the empty cells in view first, then the camera pulls back to 2.2× and each cube fills as it comes into frame (their cage lines fade in with them; the cages near the resting frame are there from the start). After the hold the camera eases back in for `grid`.
- **Grid, cell by cell** (server `breakCell`, `GridTank` `FreeBetta`, `app/phone/Helper.tsx`): each grown betta with a seat has a cell to break at `TAPS_PER_PLAYER` (30) taps; no leak. A tap goes to the visitor's own glass, or once they are out (`broken`, or a late visitor with no seat) to the cell they are `helping`. On a break the server points the owner and that cell's helpers at the nearest closed cell. On the projection a broken cell loses its front edges and cracks, and its betta swims out to a spot in front of the helped cell's glass (`helperSpot`, spread by id). On the phone, the Helper view looks at the helped cell from outside (with its cracks); a hard tilt (60% of the range, re-armed when level) or a swipe moves to the nearest closed cell that way (`help { slot }`), and chevrons show where there is one. The tank opens when the last cell breaks, or after 60s.
- **Icons, not words** (`app/_components/Hint.tsx`): a white-line icon fades in every 3s and acts out what to do: `turn` (phone rocking: lobby, inside the cell), `tap` (finger: grid, phone and projection), `steer` (dot circling a ring: open on the projection).
- **open** (`Open.tsx`, `WaterTank.tsx`, `waterCurrent.ts`, `app/phone/controls/TiltConsole.tsx`, `app/phone/useTilt.ts`): **the handoff**: `Screen.tsx` keeps the same grid element (same canvas, nothing reloads) over the open tank. The grid's freed bettas write where they show on the projection and how big into a shared map (`GridHandoff`); the open tank starts each betta there (or at its cell's centre), at the depth that keeps its size, and holds everyone still until it has drawn its first frames (`onReady`). Only then does the grid drop its water, its bettas fade out (0.7s) over their open-tank copies and its cages fade away (2.2s), so nothing jumps back to its cell. **Tilt steering**: however the phone is held when the console opens is level; right edge down → right, top edge away → down, toward you → up, full at 24°, dead zone 12%. `useTilt` reads the direction of "up" in the phone's frame (not raw beta/gamma, which flip when upright). The console shows a dot in a ring like a spirit level, and the chevron on the side it leans to lights up; a tap recalibrates (and grants iOS motion access); without a sensor, dragging the ring steers. −1…1 at ~20Hz, the strongest force. Late bettas enter from a side edge.
- **Betta card** (`app/phone/card/`): 90s after a visitor enters `open` (`openUntil`), the tilt console is replaced by their card. A hidden canvas renders the betta once (`CardSnapshot`), `composeCard` draws a 1080 × 1350 PNG (black, white lines, the betta, tag, date, trait lines from `traits.ts`). Save downloads it; Share uses the Web Share API with the file (on iOS Save also goes through the share sheet, which has "Save Image"). Same card for A and B.

### 2-4. Behaviour in open (built)

- Steering: velocity is pulled toward the phone's tilt direction.
- Wander when not steered; `reactivity` makes it turn more often, `glide` makes it wider.
- Personal space radius = `70 + boundary × 160` px (3D distance). Others inside it get pushed away, harder for high `boundary`.
- Schooling: within 480px, bettas with `genomeDistance < 0.7` attract and match velocity, scaled by `sociability`.
- Soft walls at the stage edges. Each betta keeps a preferred depth. A shared water current, stirred by the swimmers, carries everyone.
- No fighting, no collisions as drama.
- **Colour on meeting** (`encounters.ts`, `takeOn`/`meet`): any meeting (drifting within 220 or colliding) leaves a vivid patch of each other's colour at once (saturation ≥ 0.9, fades in over 0.7s). (A burst of coloured wake at the meeting point was tried and removed: it read as fireworks. The wakes keep their softer 11/28 look.) Swimming together adds another patch every 3.5s and grows that partner's patches (up to 2.3×). Up to 12 patches; a full fish loses its oldest. Visual only, genome unchanged.

### 2-5. Socket protocol (`lib/protocol.ts`)

| Direction | Event | Payload |
| --- | --- | --- |
| phone → server | `hello` | `{ role: "phone", room, playerId }` |
| phone → server | `feed` | `{ roundId, events, start?, done? }` |
| server → screen | `reaction` | `{ roundId, playerId, kind }` for a deliberate SNS action |
| phone → server | `effort` | `{ amount }` (clamped to 0–3): own cell, or the helped one once out |
| phone → server | `help` | `{ slot }`: once out, crack this closed cell instead |
| phone → server → screen | `steer` | `{ x, y }`, relayed with `playerId`; server only relays |
| screen → server | `hello` | `{ role: "screen", room, adminKey? }` |
| screen → server | `admin` | `next` / `goto` / `reset` / `prune` |
| server → all | `state` | `SessionState`: `{ roundId, serverNow, room, stage, players[], effort{total, threshold}, deadline, fillAt, gridSize }` (throttled to 100ms) |
| server → phone | `rejected` | `{ reason }` (wrong room) |

- `players[]`: `{ id, connected, phase, feedStartedAt, done, genome, released, slot, openUntil, effort, broken, helping }`. `effort` = taps on that player's cell (from anyone); `effort.total/threshold` in `SessionState` sum the cells.
- The server supplies `serverNow` and each player’s `feedStartedAt` so a phone can resume its own clock. `gridSize` controls the front lattice capacity. `fillAt` is the born stage's fill clock (server epoch; the screen subtracts its clock offset), null in every other stage.
- `phase`: `waiting` / `input` / `caged` / `free` / `fading`. Players can be in different phases because of late joiners.

### 2-6. Lobby: SNS icons on the water (planned 11/27)

The landing pool has thin picture panels floating on its surface (`public/surface-icons/`, cut from the 1x icon set: white background removed, outlines and fills kept). **Ambient** icons (30 at start: heart, happy, laugh, share, message, mad, sad, serious) are decoration. **Each joined player** adds a person icon that drops in from above the frame, splashes into the water (rings spread on the waves), bobs back up and then drifts with the rest. It never fades. Under the QR, the number of joined players is shown as a bare number (`12`), shown at 0 too.

- **Render**: each picture stacked 7 times through a thin depth (10% of its height; the layers behind the front are its darker edge), in the entry Canvas, mostly facing the camera (±15° yaw plus a slow sway). The camera is the shader's: `eye`, pitch (incl. the `-0.32·sin(π·move)` dip) and ray scale move out of the GLSL into `waterEntry.ts` (`entryCamera(diveProgress)`, printed into the GLSL as float literals), and the three camera copies them every frame in `useFrame` with a custom projection matrix (half-tan 1.35 × 0.62). Set it per frame: R3F rewrites the projection on resize.
- **Stretch**: the shader's rays span 2.7 × 1.24 (2.18:1) over a 1920 × 602 frame (3.19:1), so the whole pool is drawn ~1.47× wider than true. The matched camera stretches the icons the same way; each panel is scaled `x × (2.7/1.24) / (STAGE_W/STAGE_H)` (≈0.68) so hearts stay heart-shaped while their positions still land on the water.
- **Waves on the GPU**: split `wsHash`, `wsNoise`, `wsRoof` out of `waterSurfaces` into their own chunk (`waterSurfaces` includes it). The rest of `waterSurfaces` uses `fwidth`, which doesn't exist in a vertex shader. Vertex: lift each icon to `wsRoof` at its anchor and tilt it by the broad slope (clamped to ±0.3 rad). Fragment: below the local `wsRoof` → water tint and fade, thin meniscus line at contact. Not a JS port: `wsHash` (`fract(sin)`) differs between GPU float32 and CPU float64, so icons would sit off the visible waves. The icons read the **same `waterTime` uniform** as `EntryWater` (it caps delta and freezes under reduced motion), not a clock of their own.
- **Colour**: the pictures are sampled with no colour space and written raw like the water shader (no tone mapping), so they show as drawn.
- **Motion**: each icon drifts on its own slowly turning current inside the visible water and rocks a little; soft repulsion keeps them apart, and each one starts at the most open of 12 random spots. Baseline = the first `SessionState` that arrives after mount (state comes after the socket connects), and those ids start on the surface. A later new `player.id` falls from 2.6 above the water (gravity 7, tumbling a little), keeps a third of its speed as it hits, plunges under and springs back to float; a splash (`splashMaterial`: two rings and foam on the same wave surface, 1.7s) starts where it lands. **Leaving**: the server deletes a lobby player on disconnect (no genome yet), so `connected: false` never happens here. The client keeps a vanished id's icon half-sunk for 60s instead; if the id comes back (same `playerId` from localStorage) it rises back to the surface, otherwise it sinks away. The count under the QR is `players.length` and drops at once. Dive: the icons stay where they float and only the camera moves, so they slide up out of the frame as it goes down; once the dive ends they are no longer drawn. Reduced motion: placed, no drift or rise; `invalidate()` on every players change, since the demand frameloop doesn't tick then.
- **Capacity**: the water is the bottom ~148px of the frame (far wall at y ≈ 454px, near edge z ≈ 0.19). A 0.15-tall panel at the far wall is ~24px. 30 ambient + up to ~40 players is tight; tune ambient size and count if player icons get lost. The canvas sits above the DOM (`.ocean` z-index 1), but the QR and count end around y ≈ 295px, clear of the water.
- **Files**: `waterEntry.ts` (camera), `waterSurfaces.ts` (roof chunk split), `entryWaterShader.ts` (uses both), `PaintedWater.tsx` (shared dive progress and `waterTime`, `floaters` prop on `WaterBackdrop`), new `SurfaceIcons.tsx`, `surfaceIconImages.ts`, `surfaceIconMaterial.ts`, `Screen.tsx` + `Landing.tsx/.css` (count). No server or protocol change.
- **Not covered**: icons don't show in the water's reflection (a mirrored fake copy could come later). Without WebGL there are no icons; the count still shows.

## 3. Files

```
app/
  page.tsx                   landing: just the links to /phone and /screen over the water
  _components/               BettaShape (SVG fallback), ExhibitionBetta (cover), PaintedWater + water shaders, Hint (icons),
                             waterEntry (entry camera, shared by shader and icons), entryWaterShader (pool + dive),
                             SurfaceIcons + surfaceIconImages + surfaceIconMaterial (lobby icons on the water)
  screen/
    page.tsx  Screen.tsx     projection, admin keys, player count
    Landing.tsx              lobby: title, join QR, joined count over the pool room
    ProjectionControls.tsx   projection size calibration
    scenes/                  Grid (input, born, grid), GridTank, GridFillerFish, GridReaction, cracks, Open (+ WaterTank),
                             BettaCanvas, BettaModel, bettaMesh, bettaMaterial,
                             gridLayout, waterCurrent, swimmingPitch
  phone/
    page.tsx  Phone.tsx      phone UI switch by stage/phase
    BettaPreview(.Scene)     reusable 3D betta preview
    LookAround.tsx           lobby: look around the water by turning the phone
    modes/FakeFeed.tsx       creation and completed feed, with a personal OK start
    Cell.tsx                 grid: inside my cell (first person), until it breaks
    Helper.tsx               grid, once out: the helped cell from outside; tilt/swipe picks it
    useDeviceLook.ts         orientation sensor → yaw/pitch, drag fallback, taps
    useTilt.ts               tilt from a resting pose → x/y −1…1 (Helper, TiltConsole)
    controls/                TiltConsole (open: tilt to steer)
    card/                    BettaCard, CardSnapshot, composeCard, traits (end of open)
lib/
  protocol.ts                events and state types (server + pages)
  genome.ts                  A/B → Genome, distance (runs on the server)
  feed.ts                    feed posts and notifications
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

`public/surface-icons/` holds the icon pictures (cut from the 1x icon set, background removed).

Not created yet: `scripts/bots.ts` (N fake phones for a 15–20 person test alone).

## 4. Schedule (11/18 → 11/23)

| Date | Work | Status |
| --- | --- | --- |
| 11/19 | protocol, server stage machine, room code, dev scripts; Mode A v0; born; grid + open v0; Vercel + EC2 deploy | Done |
| 11/20 | Mode B dial pad, 3D wide-angle grid, phone preview matching the screen betta | Done |
| 11/21 | 3D bettas in all stages, shader water, English copy, plan v2; Mode A redesign (growing betta, bubbles), random cells + placeholder fill, betta card | Done |
| 11/22 | First-person cell view on the phone, icon hints, camera pull-back fill, card polish, Mode B removed; real-device check of the feed, motion access and the card (iOS share sheet) | In progress |
| 11/23 | `bots.ts` with 15–20 phones, real iOS and Android devices, leave → fade, repeated resets | Demo: repeated rounds without breaks |
| 11/27 | Landing page (title, small QR, joined count), SNS icons floating on the lobby water with the dive, review fixes (projection outline above the entry layer, lobby before the first snapshot) | Done |
| 11/29 | Creation on the projection (Codex); landing drop + splash, rising reactions incl. scrolling, fill restored, cell-by-cell breaking with helpers (no gauge), seamless grid → open handoff, tilt steering, colour on any meeting. Deployed (EC2 + Vercel, `52421e9`) | Done (headless check; real phones not yet) |

If time runs short, drop in this order: late-joiner single cube (join only in the lobby instead) → number of axes the feed covers.

## 5. Risks / notes

- **Networks**
  - Campus Wi‑Fi blocks device-to-device traffic (AP isolation, confirmed 11/18). An iPhone hotspot doesn't work either (IPv6-only; the laptop gets a fake IPv4 `192.0.0.2` via clat46).
  - With the cloud deploy, phones only need internet. For local tests: `pnpm dev:tunnel` (two Cloudflare quick tunnels, new URLs every run, open to anyone who knows them), or an Android hotspot / travel router.
  - `dev:mobile` uses a self-signed cert: each phone has to open `:3000` and `:4000` once and pass the warning.
- **Server redeploy = session reset.** State is in memory only; don't redeploy during the exhibition.
- **Room code and admin key**: the server rejects other rooms; admin commands need `ADMIN_KEY` (`/screen?key=…`). Without it the screen is read-only. CORS allows only `ALLOWED_ORIGINS` (the Vercel URL).
- **Load**: `state` is broadcast at most every 100ms. Each 3D betta is its own mesh; check frame rate on the projection machine with 20+ bettas.
- **Orientation sensor** (looking around in the lobby and the cell, picking a cell in the Helper view, steering in open) needs HTTPS (the Vercel URL; not the LAN `http://` dev URL) and, on iOS, a tap to grant motion access: the first tap on the phone asks. The feed's OK tap or a glass tap usually grants it before it matters; the tilt console shows a tap icon until the sensor speaks, and any tap there also recalibrates. Tilt steering and the Helper's tilt thresholds (24° full range, 60% to move a cell) are untested on real phones. Check on real devices, along with the frame rate of the cell view (hundreds of placeholder cubes + every visitor's betta) on mid-range phones.
- **Haptics**: `navigator.vibrate` works on Android Chrome only.
- **Next 16.4.3 security notice**: check for a patch release before the exhibition.
- **R3F copies shader uniforms.** `<shaderMaterial uniforms={u}>` copies each entry into the material's own objects (R3F `applyProps`), so mutating `u` afterwards changes nothing on that material. `EntryWater` keeps one shared clock (`waterTime`, `diveProgress`), updates it first each frame, and copies it into the pool material; the icon materials are built with `new ShaderMaterial` and hold the clock's objects directly. Sharing the prop object instead left the icons frozen at time 0 and never diving (fixed 11/27).

## 6. Backlog after the demo

- Intro video (polish the existing video 1 with AI)
- Sound: Tone.js ambience (low hum, neutral) + bubble samples with PitchShift/Distortion, different per genome
- Water affecting behaviour: rules where the space changes how bettas move
- Labyrinth organ: rising to the surface to breathe = "stepping off the network"
- Running totals: "today this tank holds n% of this kind of betta" (no ending, a quiet corner display)
- Projection mapping (see ID412 W3 experiment)

## 7. Open decisions

- [x] **Mode A redesign**: the betta grows above the feed; bubbles carry each action to it (§2-3)
- [ ] Feed copy; whether 30 banners over 45s feels right
- [ ] Card wording (`app/phone/card/traits.ts`) and whether the 90s in open is the right length
- [ ] Effort threshold, timeout, fade time: settle by running it with real people
- [ ] Exhibition date, projector resolution and aspect, expected maximum visitors
- [ ] Connection on the exhibition day: cloud (current) vs local router fallback
- [x] Phone → laptop on the demo Wi‑Fi: doesn't work → cloud deploy / `dev:tunnel`
- [x] Cloud move: done 11/19 (Vercel + EC2)
