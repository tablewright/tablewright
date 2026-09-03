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
- **Search feels like Spotlight.** Ctrl+Space opens one box, results
  as you type, driven by the keyboard. The box is pinned to the left
  edge of the screen and dims the rest. Results are tiles, two per
  row, grouped by category, spells, items, bestiary, and later lore,
  and each category draws its tile as its own kind of preview (a
  spell shows its level and casting line, a creature its type,
  challenge, and defences, an item its rarity or cost) rather than
  one uniform row; tiles were chosen over rows because compendium
  content is easier to go through that way. Grouping is
  presentation over the ranked list: within a group tiles keep their
  rank order, and groups are ordered by their best hit, so whatever
  matched best sits at the top; the ranking rules below decide the
  order, and a `type:` filter is the same thing as choosing a
  category tab. While
  the box is open the desk pans to the DM screen or the journal (§4)
  and turns it to the entry that is selected, or the top hit while
  typing. Dragging a row out of the box, or its share button, shares
  the entry with everyone at the table (§6). v1 ranking is a
  heuristic over the envelope fields (name, type, tags, source):
  every query token must match, name prefix beats word start beats
  substring, ties break by name length. Body text joins later
  through FTS5 below the name matches. The first panel shipped as one
  flat list with a type badge per row; the grouped, left-pinned form
  is designed in a Claude Design round before it is built.

### Systems and modules

- **Three layers.** A *system* is a ruleset (5e): the shape of its
  statblocks and sheets and its choice of mechanics. A *version* is
  an edition of that ruleset (5e 2014, 5e 2024). A *module* is a
  compendium of content for one version (the SRD, a homebrew
  collection). The envelope's `source` names the module; the `data`
  blob's schema belongs to the system and version.
- **A ramp, not three things.** Extending Tablewright must be as
  approachable as making a Foundry module, so code is optional at
  every level but the last. A *module* is a folder, no code: a
  manifest plus one JSON file per entry, or the single SQLite that
  folder compiles to. A *declarative system* is also a folder, no
  code: its manifest picks and parametrises rule families the engine
  already implements (grid type, distance rule, dice, turn order,
  resource pools); 5e's every-square-is-5-feet diagonal is one line
  in it. A *coded system* adds a Rust crate for logic no family
  covers (derivations, level-up). Shared logic therefore lives in
  the engine as rule families, written once in Rust and once on the
  board; systems only choose among them. A deliberately different
  second system, even a tiny one on hexes, is added early to keep
  the families generic and 5e's assumptions out of the engine.
  Longer term the plugin format for coded systems is WebAssembly, so
  one build runs in the core and in the browser client and
  contributors are not bound to Rust; noted, not decided.
- **Campaign creation** picks a system, then a version, then
  multi-selects the modules to include, with the bundled SRD checked
  by default. One compendium serves both apps, so Vault lore can
  reference compendium entries and entries can reference lore.
- **What ships.** Only content Tablewright may redistribute: the SRD
  under CC-BY-4.0, and homebrew that is CC-BY-4.0 or licensed to
  Tablewright. Nothing else of 5e. The bundled SRD is the latest
  under a usable licence, SRD 5.2 (the 2024 rules), imported from
  Open5e's `srd-2024` document; the committed module is the pin, and
  a re-run of the importer shows upstream drift as a diff. SRD 5.1
  can become a second module later. The licence's attribution notice
  ships with the module and shows in a credits view; the name is
  "5e SRD", never the trademark.
- **Where things live.** A bundled system is one directory,
  `systems/<system>/`: `system.json` as the entry point,
  `content/<version>/<module>/` for its bundled modules, and `src/`
  only when it is a coded system. `system.json` declares, per kind,
  the facets search may filter on as dotted paths into `data`
  (`"spell": { "level": "level", "school": "school.key" }`); the
  seeder reads them once and stores the values on each entry, so a
  query never opens `data`. A module directory is `module.json`
  (id, name, version, licence, attribution, upstream) and one JSON
  file per entry in the envelope shape under `<kind>/<slug>.json`,
  ids `<module>:<kind>:<slug>`. A DM's own module, say a book they
  own, has exactly that shape in a folder on their machine and is
  imported from the app; it never enters the repo. The compendium
  SQLite is generated from module directories at build time and
  shipped as an app resource, never committed.
- **Typing.** For the PoC the `data` blob is untyped JSON. Typed
  system data (Rust structs, generated TS) comes after; its shape is
  undecided.

### Search ranking rules (v1)

The rules are the spec; `crates/core` implements them with one unit
test per rule. They are expected to change; change the list first.

1. Both query and fields are normalised: lowercase, diacritics
   stripped, whitespace collapsed. The query splits on whitespace into
   tokens. A token of the form `field:value` whose field is `type`,
   `tag`, or `source` (for example `type:spell`) is a filter, not a
   scoring token. So is `name<op>value` for any other word, with one
   of `:` `=` `<` `<=` `>` `>=` as the operator (`level<=3`,
   `school:evocation`, `cr>=1/4`): a facet filter, answered from the
   facets the system manifest declares per kind and the seeder reads
   out of `data` (§3 "Systems and modules"). Numbers compare as
   numbers, fractions included; text only ever compares equal; an
   entry without the facet never passes. Anything else with a colon
   (`12:30`) is an ordinary token.
2. Every scoring token must match at least one field: name, tags,
   type, or source. More tokens narrow the result, never widen it.
3. A token scores by the best match it finds; lower is better. In
   the name: exact 0, prefix 1, start of a later word 2, substring 3.
   The same ladder in tags adds 4; in type or source it adds 8. A
   name hit therefore always beats a tag hit, which always beats a
   type or source hit.
4. Two small penalties separate near-ties: the match offset within
   its field, and how much longer the name is than the query.
5. Tokens that match consecutive words of the name in order earn a
   phrase bonus.
6. Order is total score, then name length, then name alphabetically,
   then id as a last resort. The list is flat, capped at fifty rows,
   each with its type badge.

Not in v1, by choice: typo tolerance, initials matching, and usage
boosts. Body text arrives through FTS5 as a lower tier.

Scale: the SRD is a few thousand entries, and a linear scan of the
catalogue takes well under a millisecond. A full 5e library plus a
few homebrew books runs to tens of thousands, so the catalogue gains
a derived n-gram index (trigrams, and bigrams for two-letter tokens)
as a candidate pre-filter (rebuildable, never the record) and, while a
query is being extended, rescores only what the previous query
matched. The rules above stay the ranking; the index and the previous
match set only choose candidates, and only the top of the list is
ever sorted.

### Linguistic search and filters

Decided 2026-09-03 after the filters design round (canvas page
"Filters"). The operator syntax of rule 1 stays as the wire form; it
is not the interface.

- **Two ways in, one filter set.** A query is typed words, tray
  controls, or both. Both lower to the same filter expression the
  ranker applies, so the tray and the parser can never disagree about
  what a filter means.
- **The words stay the words.** Typed text is never rewritten into
  chips or tokens, and never edited by the app. A mask over the input
  underlines in brass what the parser understood, and greys out a
  phrase the tray has since overruled, so the words stay and the
  search shows which reading it used. There are no chips in the
  input: the tray is the one place filters show, and the funnel
  button carries their count. A kind word (spells, creatures, items)
  lights the category tab, since the tab is that filter.
- **Grammar by pest, meaning by data.** The linguistic layer is a pest
  (PEG) grammar over normalised tokens: numbers, ordinals, fractions,
  ranges, comparator phrases, and the connectives and, or, not;
  everything else is a word, so half-typed input falls through to
  plain tokens rather than failing. A lowering pass binds words to
  facets from two sources: the system manifest (facet words and
  aliases such as cantrip = level 0, kind nouns and plurals) and the
  catalogue (the live set of each facet's values, so "evocation" is
  recognised because the data holds it). Comparator phrases and number
  words are a per-language vocabulary file beside the grammar;
  inflection comes from a Snowball stemmer and accent folding from
  unicode-normalization, both per-language switches. No language
  model: results stay instant while typing, and mistakes are
  deterministic and therefore fixable.
- **Comparators.** Strict: below, under, less than, lower than, above,
  over, more than, higher than. Inclusive: up to, at most, no more
  than, or lower, or less, at least, no less than, or higher, or more,
  N+. A bare number, an ordinal (3rd level) and a fraction (cr 1/4)
  mean equality; between A and B, A to B, A–B mean an inclusive range.
  A phrasing the grammar does not know must not empty the list, so
  rule 2 changes with this layer: a token that matches no field of any
  entry is dropped instead of failing everything (data-driven, no
  stop-word list, because "of" is in half the item names).
- **Filter expression.** Filters form a tree of all, any and not
  rather than a flat list, so "level 3 or 5", "not evocation" and
  "wands or staffs" are grammar rules with precedence. Within one
  control several values mean any of them; controls combine with all.
  Text facet values also count as a field in rule 3, at the tag rung,
  so a word that happens to be a facet value ranks entries rather than
  excluding them ("giant" still finds Giant Spider, a beast).
- **The tray.** Inside the box under the category tabs, scrolling away
  with the tiles as one column, never an overlay over the compendium
  leaf. It opens on the funnel button or when typed words match a
  filter, and stays shut on the All tab until user testing says
  otherwise. One control per facet the manifest declares for the
  category, in the manifest's order, chosen by the kind of fact. A
  *span rail* for a short ordered scale (level, size, rarity): one
  click is exactly that value, a second click or a drag is the span
  between, and a span reaching an end of the rail is open (level up
  to 2). A *switch rail*, the same strip with each cell its own
  switch cycling off, on, not, for a few values or a yes/no fact
  (ritual and concentration, verbal/somatic/material, self and touch,
  the two alignment axes, attunement). A *stepped slider* for a long
  scale, two nuts on stops the system declares (range, casting time,
  challenge rating, armor class, cost, weight); a nut left at an end
  reads as open (CR 5+). *Toggle chips* for a long unordered set
  (school, creature type, category), cycling off, on, not, with long
  sets folded behind "more". One *select*, duration. Hit points are
  not a filter. Clicking a control edits the filters and reruns the
  search at once; a control that typed words had selected can be
  changed in the tray, and the click wins for that facet while the
  phrase greys out in the input.
- **The manifest declares it all.** Per kind, each facet's path,
  control (span rail, switch rail, slider, chips, select), order,
  stops, display words and aliases; every system says what is
  searchable and filterable, and the tray renders whatever is
  declared. The category labels the UI shows come from the same
  place, so no kind, label or control is hard-coded in TS.
- **Who sees what.** The bestiary is DM material: in the manifest the
  `monster` kind defaults to visibility dm and data visibility dm, so
  no creature reaches a player's box, category tabs or tray, and the
  player side simply has no Bestiary. That is the only permission
  restriction for the PoC. Kinds carry these defaults; an entry file
  may omit its visibility and take the kind's, and an explicit value
  in the file wins. Facets may take a visibility of their own later,
  for the day a shared creature shows players its name but not its
  CR; nothing needs it yet.
- **Later.** Units (60 feet) and grammars for other languages.

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
- **Two surfaces on the desk.** Beyond the board and the small tool
  menus (drawing and the like), each role has one place where its
  content lives. The DM has the *DM screen*: three leaves standing
  side by side like a physical screen, holding DM things such as the
  full compendium, the scene switcher, and advanced options. A player
  has the *journal*: a two-leaf spread with a spine, in the manner of
  izelya.me's journal but in the fantasy skin, with thumb-index tabs
  cut into the page edge as its rail; it holds the character sheets
  and handouts they have access to, and the compendium as their tier
  sees it. Each leaf takes the document look of DESIGN.md. Both are placed on the desk near the board, so the camera
  pans over to them, and each is hinted at the screen edge in the
  manner of hexpunk's hextrack rail: a translucent peek that raises
  on pointer or keys and auto-pans the desk when clicked, folding
  back on Escape. What matters is the feeling that they are on the
  desk with the board. Whether they truly live in world space or are
  an overlay with the board moving underneath, faked for the sake of
  performance, is an implementation choice, as long as the animation
  makes sense: the pan, the settle, and the return have to read as
  one desk. Not part of the PoC; the spotlight (§3) is the first
  thing that pans to a surface.
- **Which scene you are in.** A small scene tab at the top left of the
  board names the scene on show, for players and DM alike; when
  players are connected it carries a small mark per player viewing
  that scene, since a DM may let players view more than one. Players
  see one tab, sometimes a couple. The DM's full list lives in the
  DM screen's Scenes leaf, in the manner of Foundry's scene
  directory: folders (prepared, unfinished, old), a thumbnail per
  scene with its name over it, create and search on top, and the
  player-facing tab repeated for quick reference. The tab ships with
  the PoC; the marks and the leaf come with players and the surfaces.
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

- **Share to the table.** Any entry a viewer can search can be shared
  with everyone in the session, by dragging it out of the search box
  or pressing its share button. A share is a message carrying the
  entry as the receiving tier may see it, applied by the DM's
  process like every other outbound message, and each client shows
  it as a dismissable card. In practice there are two views of an
  entry: the DM's, which is everything, and the player's, which is
  reduced. A share carries the player view; the DM may push the
  everything view deliberately, by a reveal control on the card, and
  nothing is revealed by accident.
- **Offline sheet edits (later).** A player may open and edit their
  own character while the DM is offline: the player page is a
  service-worker app, the sheet and the compendium slice the player
  may see (world and party tiers) are cached locally, and edits go to
  a signed local change log. Sheet fields have an owner: player
  fields (background, lore, description, level-up choices) and DM
  fields (rewards, secret alterations). On reconnect the log is
  applied on the DM's side; a per-player trust setting auto-accepts,
  otherwise an update control appears only when offline changes
  exist. Where both sides changed one field the DM sees the two
  values side by side, theirs and the player's, and picks; never a
  diff view. The DM's changes to player sheets are never surfaced to
  the player as a merge, so a secret alteration stays secret. Open:
  store-and-forward when the two are not online together (accept the
  wait, Nostr relays as an encrypted mailbox, or a small hosted
  mailbox), and whether sheet rules run in the browser as the Rust
  core compiled to WebAssembly or as TypeScript.

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
