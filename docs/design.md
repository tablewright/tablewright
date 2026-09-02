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
  star, and the same table hosts any genre. Per-campaign theming
  *(later)*.

## 5. Board engine

PixiJS (WebGL).

- **Hybrid rendering:** canvas for grid, background, lighting,
  effects; DOM overlay positioned by the same camera transform for
  rich content (panels, labels).
- **Engine/skin split:** camera, coordinate math (square + hex),
  drag-snap, hit-testing are aesthetic-neutral; looks are skins.
- **Token bridge:** CSS custom properties are read via
  getComputedStyle, fed to Pixi, re-read on theme change.

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
  wall height, token facing, token model ref.

Movement is free, bounded by the character's speed. The token moves
anywhere; a counter shows distance spent against the budget (30 ft
is six cells); walls and blocking tokens stop it; the budget resets
with the turn. The same rule governs top-down drags, so the mechanic
lives with the scene rules, not the 3D view: the client predicts
and shows the counter, the DM's process is the authority (§6) and
corrects an overrun. Distance uses the measurement layer's ruler.

Open: path length (Euclidean) versus grid-equivalent cost; which
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
- **Signaling service** sees no game data. TURN fallback for
  connectivity; optional dumb asset relay for slow DM uplinks;
  headless DM host as the eventual server-hosting story.
- Player client is a **browser page**.

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
