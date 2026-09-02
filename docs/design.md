# Tablewright — Design

Local-first virtual tabletop and worldbuilding suite. Two desktop apps
(Tauri) over one Rust core: **Table** (VTT) and **Vault**
(worldbuilder), sharing a **Compendium** of structured game content
and one unified search. Players join Table sessions from a browser
link — no install. Sections marked *(later)* are direction, not
commitments.

## 1. Goals

1. **Findability.** Anything — item, rule, image, lore note — in
   seconds, from one search. Sub-100ms local results; no content
   silos.
2. **Performance.** Figma/Miro-class canvas feel; character sheets as
   instant lightweight panels; comfortable alongside Discord and a
   PDF.
3. **Ownership.** The DM's machine holds everything. Sharing is
   secure P2P; no port-forwarding, no hosting fees, no content held
   hostage by a subscription.
4. **Import.** Third-party and homebrew PDFs become structured
   content without hours of hand transcription. DM-only,
   human-in-the-loop.
5. **Presence.** It should feel like sitting at a physical table.
   Not one to one, but every element is based on a thing a table
   has: desk, paper, ink, brass instruments, dice, a map. Objects,
   not widgets. The visual system that follows from this lives in
   DESIGN.md.

## 2. Product shape

Three content spaces, two apps:

- **Vault** (app) — freeform worldbuilding lore: markdown files,
  wiki-links, no imposed schema. Also usable standalone by writers.
- **Compendium** (shared store, not an app) — typed, structured game
  content: mechanics, spells, items, with a bestiary section.
  Browsable by taxonomy, faceted-searchable
  (`type:spell level<=3 school:evocation`), referenced by stable id
  from sheets, tokens, and lore. Surfaced inside both apps.
- **Table** (app) — the VTT: scenes, tokens, grid, dynamic lighting
  and sound, measurement and template tools.

One search spans Vault and Compendium; results are labeled by origin.

## 3. Content model

- **Stable envelope, pluggable systems.** Every Compendium entry
  shares a system-agnostic envelope — id, type, name, source, tags,
  visibility, prose body — plus a structured `data` blob whose schema
  is defined per game system. Search, browse, links, and sync depend
  only on the envelope.
- **Visibility is data, field-level.** Tiers: DM / party / world.
  Field-level, so players can see a monster's name and art while its
  statblock stays DM-only. Party discovery state layers on top. Every
  query and outbound message honors visibility.
- **Provenance.** Every entry belongs to a source (book, module,
  homebrew collection).
- **Stable ids** on entries; links never break.
- **A compendium is one SQLite file** — shareable, and the module
  format.
- **The search index is derived data**, rebuildable, never the store
  of record. FTS5 + JSON attribute indexes; swappable later without
  touching stored content.

## 4. Architecture

Monorepo: Bun + Turborepo (TS) alongside a Cargo workspace (Rust).

```
apps/table        VTT — Tauri shell
apps/vault        worldbuilder — Tauri shell
apps/player       browser player client — static Vite build, no Tauri (later)
packages/schema   TS types generated from Rust (tauri-specta); never hand-written
packages/ui       shared Lit components — recessive, fantasy-neutral chrome
packages/board    PixiJS spatial engine (camera, grids, drag, hit-testing)
crates/core       entity model, vault fs, compendium store, search index
crates/net        WebRTC sync + content-addressed assets (later)
```

- Rust is the source of truth for shared types; TS declarations are
  generated.
- `packages/ui` and `packages/board` stay Tauri-agnostic for the
  browser player client.
- App chrome stays visually recessive: map art and tokens are the
  star. The look is a desk with paper on it (DESIGN.md): dark warm
  tool chrome, light paper documents whose sections are shaped like
  instruments and rendered as materials, and a board that keeps a
  neutral ground so map art is never tinted. Fantasy craft is the
  first skin; other genres and per-class accents are skins over the
  same tokens *(later)*. The PoC ships flat colour; materials and
  instrument frames are a post-PoC stage.
- **Platforms.** Windows is the target now (WebView2, the Chromium
  engine as a shared runtime; the default browser is irrelevant).
  Linux comes next and must at least be usable: the engine there is
  WebKitGTK, with documented NVIDIA/Wayland trouble and WebGL that can
  silently fall back to software, so it is evaluated on the real
  machine before commitment. macOS (WKWebView, the Safari engine) is
  untested for lack of a machine; nothing engine-specific is written
  and no fixes are promised without one. The frontend stays on
  engine-neutral features: WebGL2, pointer events, no WebGPU-only
  paths. Fallback if a system WebView fails: serve mode (§6), the
  same binary serving the DM client to the user's own browser.
  `packages/ui` and `packages/board` being Tauri-agnostic keeps that
  possible; only the transport under the command boundary changes.

## 5. Board engine

PixiJS (WebGL).

- **Hybrid rendering:** canvas for grid, background, lighting,
  effects; DOM overlay positioned by the same camera transform for
  rich content (panels, labels).
- **Engine/skin split:** camera, coordinate math (square + hex),
  drag-snap, hit-testing are aesthetic-neutral; looks are skins.
  Square ships in the PoC; hex *(later)* imports the pointy-top
  lattice math from `@hexpunk/core` rather than duplicating it.
- **Token bridge:** CSS custom properties are read via
  getComputedStyle, fed to Pixi, re-read on theme change.
- **Input follows VTT convention,** not design-tool convention:
  left-drag or middle-drag on empty board pans, the wheel zooms about
  the cursor, and a trackpad pinch zooms the same way. Anything in
  the scene that claims a pointer stops the native event before it
  reaches the board element, so the camera only ever pans on empty
  board.
- **Pointer events only,** for mouse, touch, and pen alike; no
  touch-specific handlers. The board element sets `touch-action:
  none` so the browser never claims a gesture. One finger pans empty
  board or drags a token; two fingers pinch to zoom and pan. Nothing
  depends on hover, so every affordance a hover reveals must also be
  reachable by tap or selection. Arrow keys or WASD step the selected
  token one cell, the same scene command as a drop. A tap on empty
  board, or Escape, clears the selection.
- **Tokens carry a facing** in degrees clockwise from north. Every
  token wears a ring open at the rear with an arrow at the front, in
  the manner of an FF14 target ring, dim at rest and lit by hover or
  selection, rather than rotating the token art, which stays upright
  and legible. A move faces the token along its travel; a move that
  goes nowhere keeps its facing. Turning in place: press and hold a
  token, or press the selected token's cell outside its disc, where
  the corner brackets are, and the facing follows the pointer until
  release. *(later)*: a rotate
  button in the selection UI, and targeting another token to face
  it.

### First-person view *(later)*

Players may switch to a first- or third-person camera on their own
token, rendered by a three.js module in the browser player client
that loads only when the mode is entered. It is a second view of the
same scene document, never a second source of truth.

- Walls extrude to a scene-level height; the map image is the floor;
  scene lights become point lights, with shadow casters capped or the
  2D visibility polygons reused as light masks.
- Tokens render as billboards or stand-ups of their 2D art until an
  optional model asset (glTF, content-addressed like every asset) is
  attached. The 2D art always remains the fallback.
- Sheets, inventory, chat: the same DOM panels as top-down, floating
  over the 3D canvas, pre-mounted, opened by hotkey in the same
  frame. Name plates and HP bars are world-anchored and projected
  through the 3D camera, the hybrid-rendering rule above.
- Two input modes: look mode (pointer lock or drag-orbit, keys to
  move) and cursor mode (pointer free, panels usable). Opening a
  panel enters cursor mode; Escape returns.
- Scene document additions when needed, all optional with defaults:
  wall height and token model ref. Token facing already exists on
  the board model.

Movement is grid-step by default: one press moves the token one
cell, the classic dungeon-crawler feel, and each step is the same
scene command as a one-cell move on the top-down board. Free
movement is an optional mode for fun: the token moves anywhere,
walls and blocking tokens stop it. Both spend the character's speed
against a visible counter (30 ft is six cells), reset with the turn,
and live with the scene rules, not the 3D view: the client predicts
and shows the counter, the DM's process is the authority (§6) and
corrects an overrun. Step cost uses the measurement layer's grid
distance and diagonal rule; free movement uses path length.

Open: turn increments in grid-step (90°, 45°, or free look); which
tokens block (a system rule); exploration without a budget; undo to
turn start; DM preview inside Table; timing relative to multiplayer.

## 6. Networking *(later)*

- **DM-authoritative, split by traffic class.** Small frequent state
  (token moves, HP, fog, dice, wall/light/sound definitions, VFX ids
  + parameters) flows P2P over WebRTC data channels. Clients compute
  vision, lighting, and audio locally from definitions — replicate
  state, never pixels.
- **Assets leave the live path.** Content-addressed by hash; players
  cache permanently; upcoming scenes pre-sync in the background;
  reveal is a "show scene #hash" message. Players swarm asset chunks
  peer-to-peer.
- **Signaling over public Nostr relays**, Trystero-style: the core
  and the player page each speak Nostr directly, and the payload is
  encrypted with the invite secret so relays learn only that a
  session exists. An own relay (a small serverless WebSocket worker)
  is the fallback if public relays misbehave. TURN fallback for
  connectivity; optional dumb asset relay for slow DM uplinks;
  headless DM host as the eventual server-hosting story. The Rust
  WebRTC crate is chosen at the multiplayer milestone.
- **Scale target.** A session is one DM plus up to 32 players
  (typical 3–6, the most seen 10). State flows over a star with the
  DM as hub. Asset swarming uses a limited-degree partial mesh among
  players, so no browser holds more than a few peer connections. A
  per-session cap, default 32, bounds resource use.
- **Deployment.** The player page is static and lives on GitHub
  Pages under the DM's own domain; no server is required. Signaling
  needs no infrastructure with public relays. TURN, when wanted, is
  a hosted free tier.
- Player client is a **browser page**, `apps/player`: the same UI and
  board packages as Table, a static Vite build, no Tauri.
- **Serve mode.** The same installed binary has a second entry
  point, `table --serve`: it runs the core plus a local HTTP and
  WebSocket server from crates/net without creating a WebView,
  serves the embedded frontend, and opens `http://127.0.0.1:<port>/`
  in the user's own browser with a per-launch token in the URL. Bound
  to loopback only; LAN exposure is a separate explicit choice. It is
  the DM client on a machine whose system WebView fails (§4
  Platforms), and with the browser step skipped it is the headless
  host. The player client is the same page with a player role, so
  one server serves both.
- **One command surface, two transports.** Commands are defined once
  in Rust; the generated TS boundary is a single typed `call` that
  goes over Tauri invoke in the window and over WebSocket in the
  browser. Nothing above that line knows which. Browser mode swaps
  Tauri-only conveniences for web ones: file dialogs become the
  browser's picker, assets are served by hash over HTTP instead of
  the asset protocol.

## 7. Book import *(later)*

Third-party and homebrew purchased content. DM-only.
Human-in-the-loop: the importer proposes structured entries into a
side-by-side review UI. The compendium file format is the import
target; creators can ship native files.

## 8. PoC — board-first (current focus)

A single-player DM sandbox in Table. No networking, no character
sheets, no Vault app, no import. Proves: the board feels
Figma-smooth; lighting and sound are first-class.

Build order (each stage demoable):

1. **Stage + camera + grid + tokens** — pan/zoom, map image
   background, square grid, tokens drag with snap.
2. **Core + search + SRD seed** — crates/core with the compendium
   store and FTS5 search; the SRD seed generated by script; a
   search-as-you-type panel with a latency readout; the Rust scene
   document. Search "goblin", drag it onto the board.
3. **Measurement layer** — ruler plus cone/circle/rect templates,
   bound to grid units.
4. **Walls + dynamic lighting** — walls as line segments; visibility
   polygons; darkness layer punched by light masks. The same wall
   data later drives token vision.
5. **Dynamic sound** — ambient emitters with position/radius/falloff;
   Web Audio gain/pan by distance to a listener token.

Search speed and board interactivity lead: stage 2 comes before the
tools so real content and real search are felt early, and every
stage carries a measured target.

Seed data: **D&D 5e SRD** (CC-BY-4.0; machine-readable via the 5e SRD
API / Open5e). The first compendium file is generated by script.

**Acceptance scene:** load a tavern map, place walls, find a goblin
by search and drop it in with two more tokens, measure a move, splash
a fireball template, light a torch on a token, put crackling-fire
ambience on the hearth.

## 9. Milestones

1. **PoC** (§8).
2. **Compendium proper** — envelope + visibility + provenance,
   faceted search UI, hardened SRD pipeline.
3. **Vault v1** — the Araitael vault (Obsidian + Bookspire export)
   imported, local, searchable.
4. **Multiplayer** (§6).
5. **Import** (§7).
