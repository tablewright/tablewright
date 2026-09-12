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
  query and outbound message honors visibility. Who may see and do
  what, and the file that says so, is
  [docs/permissions.md](permissions.md).
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
- **A campaign is a folder.** Everything a table needs for one
  campaign lives in one directory: `campaign.json` (name, system,
  version, the library modules chosen); `compendium/` *(later)*, the
  campaign's own compendium SQLite, derived from `modules/`
  *(later)*, the campaign's own modules with a homebrew book among
  them, never the record; `scenes/`; `assets/`, pictures opened
  into the campaign, copied in and named by a path relative to the
  folder; `players/` *(later)*. Campaigns live under the Tablewright
  home, `Documents/Tablewright/campaigns/`, unless the DM puts one in
  a folder of their own, and the app remembers each by path. A
  folder is copyable and hostable as one thing: serve mode runs over
  a campaign folder wherever it sits. The app's own data directory
  holds only what is no campaign's and no library's: the list of
  campaigns. An intro screen lists the campaigns and opens one, as
  Foundry's setup does; the first run makes the example campaign,
  the tavern with the mansion and the hill. A shipped adventure must
  be redistributable (CC-BY), which none of the free WotC ones are.
  Decided 2026-09-10.
- **The library, and the campaign's own.** The compendium a table
  searches is two layers. The **library** is shared by every
  campaign on the machine, under the home at
  `Documents/Tablewright/library/`: the bundled SRD, both rule
  versions, installed there from the app on first run and again when
  the bundle is newer, and *(later)* the modules the DM installs, a
  book they own, so every 5e campaign of theirs has it at once. The
  **campaign's own**, `compendium/` in its folder, holds what belongs
  to one campaign only. A campaign's manifest lists the library
  modules its table sees, so a 2014-only table hides the 2024 SRD;
  the campaign's own entries win where an id collides, so a house
  Fireball replaces the SRD's. Both stores are derived, rebuilt from
  modules, never the record; a campaign never carries a copy of the
  SRD. Decided 2026-09-10 (user): the SRD is bundled with the app;
  compendiums live in the app and in the campaign with the
  campaign's taking precedence; one library serves many campaigns.
  The library sits in the home rather than app data so it is visible
  and copyable beside the campaigns. A new campaign lists every
  module of the bundled SRD, read from the library itself, so a
  module added to the bundle joins new campaigns without anyone
  keeping a list; choosing modules at creation, with at least one
  SRD required, comes *(later)*. Decided 2026-09-11 (user), after a
  hand-kept list had left the 2014 conditions module out.
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
- **The stand-in's cast.** The page served without Tauri, the one
  the stories drive, answers from a stand-in for the core. Its
  entries are not written by hand: when the seed builds the
  compendium, it also writes the stand-in's cast, a short list of
  things in every version, as the core answers them for the DM and
  for a player (rendered pages, parts, versions), with the fields
  search reads, the system's manifest and its facet values. The file
  is committed, since the story job in CI has no Rust, and CI's Rust
  job fails when the committed copy is stale. Only the stand-in's
  small search stays hand-written. The cast is a placeholder: once
  the page reaches the real core over the network layer (§6), the
  whole SRD is in and the stand-in goes. Decided 2026-09-11 (user),
  after a hand-written creature missed the tag its tile reads.
- **Coverage (decided 2026-09-03).** The SRD module carries everything
  Open5e publishes for it, not a selection: creatures, magic items,
  spells, equipment, classes, species, backgrounds, feats, rules and
  conditions. Kinds: `monster`, `magic-item`, `spell`, `item`, `class`,
  `race` (Open5e's species, named races here by choice), `background`,
  `feat`, `rule`, `condition`. The box groups them as Spells, Bestiary,
  Items (equipment and magic items), Characters (classes, races,
  backgrounds, feats) and Rules (rules and conditions). Rules and
  conditions are the foundation the typed system data stands on, and
  "what does frightened do" is a name search that opens a page;
  classes and races are what character creation builds from later.
  Only the bestiary is DM material; the rest is world.
- **Two rule versions, one compendium (decided 2026-09-03).** The 2014
  SRD (5.1) ships beside the 2024 SRD (5.2), each as modules of its own
  version, and a table picks the version in play; the DM who wrote
  this prefers 2014, so neither is the default by fiat. An entry is a
  *version of a thing*: `<kind>:<slug>` is its identity across
  versions, so fireball is fireball in both, and a tile or a page
  shows one version only. The version is each person's own: a player
  on 2014 rules sits at the same table as one on 2024, so anyone may
  switch whenever they like, the choice is remembered per person, and
  every query carries the viewer's version as it carries their tier.
  When that version has no entry for a thing the other version's
  stands in, badged with its year, which is how a 2024 reader sees
  conditions today. Comparing the two side by side is a later view,
  not a tile with two years on it. Open5e's `srd-2014` document is
  the 2014 source. *Amended 2026-09-04 (user):* until character sheets
  exist there is no person to remember a version for, so the personal
  version waits for them. Until then the box folds every thing to one
  default version, the newest, badging a stand-in with its year, and
  the page carries its own switch, per thing: a rail in its footer
  where the source used to show, one cell per version the system comes
  in, lit for the version shown and dimmed where the thing does not
  exist, which turns the page to the same thing in the other rules.
  The core already takes the viewer's version on every search and
  serves "this thing in that version", so the personal choice, when it
  comes, is a preference that feeds both.
- **Searchable data, not body text.** A creature's traits, actions,
  reactions and legendary actions, and a class's features, are named
  parts inside `data`. The manifest names the lists that carry them,
  the seeder stores the part names on the entry, and the ranker
  matches them as one more field at the tag rung, so "pack tactics"
  lists every creature with it and the tile says which part matched.
  Parts are a way in, never a filter: no facet, no control. Searching
  inside a part's wording waits for FTS5, which moves out of the PoC
  to the Vault stage with lore, where body text matters.
- **Body text is markdown, rendered by the core (decided
  2026-09-04; crate and order open).** What the bundled data
  holds: 825 of 3401 entries carry markdown, all of it GFM: bold,
  italics in both spellings, 156 tables with alignment rows, headings
  inside rules, a few lists, seven blockquotes, two links, hard breaks
  in item text; no raw HTML. 1.5 MB of body in all, the longest entry
  14 KB. The page hand-renders paragraphs and bold today, so tables
  and headings show raw. Rendering belongs to the core, in Rust: one
  function that the seeder, a DM's module import, a command for
  markdown living inside `data` (a trait's text, once the statblock
  view exists) and later the Vault's editor preview all call. The
  page inserts HTML it never builds: no TS parser, no work at open.
  *When:* rendering on demand in the core is the primary API, since
  the Vault renders as one types and a trait's text lives inside
  `data`; the bundled compendium may also store the HTML beside the
  markdown at seed time as a cache, derived data like the index. The
  markdown stays the store of record for FTS5 and editing. Either is
  cheap: 1.5 MB renders in well under a second in any crate below.
  *Which crate:* comrak (0.54, BSD-2-Clause; crates.io, docs.rs,
  GitLab, Reddit) parses to an arena tree that is walked and mutated,
  then formatted, and `create_formatter!` overrides rendering per node
  type: the parse, transform, stringify shape of remark and rehype, so
  the callouts plugin from izelya.me ports nearly line for line.
  Extensions: table, strikethrough, tasklist, autolink, header IDs,
  footnotes, description lists, wikilinks, GitHub alerts, multiline
  block quotes, math, underline, spoiler. Raw HTML is escaped by
  default. It must be taken with `default-features = false`: the
  defaults pull clap and syntect with oniguruma, a C build, into every
  rebuild. pulldown-cmark (0.13, MIT; rustdoc, mdBook) is the fast pull
  parser: an iterator of events mapped and filtered before the HTML
  writer, with tables, footnotes, strikethrough, tasklists, heading
  attributes, wikilinks and the GitHub alert kinds; no tree, so a
  transform that reads a block's first line, as the callout marker
  does, buffers events instead of touching a node. markdown-rs (1.0,
  by remark's author) yields remark's own mdast but cannot render a
  tree back to HTML, which rules it out. *Transforms Tablewright will
  want*, the reason a tree matters: dice expressions to a rollable
  span; wikilinks `[[condition:frightened]]` to in-app links, the
  Vault's lore; tables wrapped to scroll; headings demoted under the
  page's own title; the bold lead-in sentence of a spell ("Using a
  Higher-Level Spell Slot.") as a run-in heading; blockquote callouts;
  external links opening outside. None exist yet; the first cut
  renders plain GFM and each transform is a step of its own.
- **One renderer, two surfaces (decided 2026-09-04).** The Table's
  pages and the Vault's notes feel like different uses of markdown,
  but the grammar is the same; what differs is when a render happens
  and what a link resolves to, and both are parameters of one
  renderer: a render-on-demand call, and a resolver the host passes
  in. The house dialect is Obsidian's, for modules and notes alike, so
  a Vault page can become a module entry without translation and a
  module author can draft in Obsidian: CommonMark and GFM, wikilinks,
  callouts with any name and a title, embeds, tags, highlights,
  footnotes, front matter. comrak covers most natively; the rest are
  Tablewright transforms on the tree, never a second parser. The Vault
  will still hold a second parser by job, not by app: the editor's own
  syntax layer (CodeMirror's, incremental, keystroke rate) decorates
  the text being edited and never produces HTML anyone else sees;
  every piece of HTML in the product comes out of the core. A player
  in the browser receives HTML the DM's core rendered, so the player
  view carries no parser and sanitising happens once, in Rust. The
  editor is a Vault-stage decision.
- **Custom syntax has one source (decided 2026-09-04).** Additions
  such as `[!name key:value]` on a blockquote or heading (the callouts
  plugin from izelya.me is the model), dice, wikilinks and embeds are
  implemented once, in the core, which already feeds both apps. The
  only other consumer is the Vault editor's live preview, which does
  not exist yet; when it does, it is fed from the same declaration,
  not rewritten: the syntax rules are a table in Rust (node type,
  marker pattern, attribute to set) and a generator emits the TS copy
  into `packages/schema` as tauri-specta emits types, Rust the source
  of truth as the house rule says. If an addition ever needs a real
  parse in the editor, the core's markdown module compiles to WASM as
  a second build target of the one implementation (comrak is pure
  Rust with its default features off, and ships as WASM inside Deno's
  documentation tooling). Syntax that belongs to a system rather than
  the product, dice notation above all, is declared in the system
  manifest beside facets and parts, which both apps already read from
  the compendium. Recognising `[[frightened]]` is a shared rule;
  resolving it to a compendium id, a Vault note or a broken-link
  marker is the host's resolver, which is what keeps the two uses from
  bleeding into one implementation.
- **Modules need no code.** A content module for Tablewright is JSON
  plus markdown in the module format; markdown is the formatting a
  module author reaches for, and the manifest keeps facets, parts and
  controls declarative. Rust, or a scripting language such as Lua,
  enters only for a coded system, where rules become logic. That
  language is chosen when the first coded need appears, against a
  real case, on two criteria: sandboxing, since a module runs on the
  DM's machine and reaches players, and whether it also runs in the
  browser player view, which favours JavaScript or WASM over a native
  Lua unless Lua itself ships as WASM.
- **Typing.** For the PoC the `data` blob is untyped JSON. Typed
  system data (Rust structs, generated TS) comes after; its shape is
  undecided.
- **Import as a pipeline (noted 2026-09-03).** The importer will grow
  into three stages: read the upstream shape (Open5e today, a book
  tomorrow), transform it into the Tablewright spec for the system,
  and write module files. The transform is where knowledge is added
  that the upstream never had and the table needs: a spell whose
  range is "self, 15-foot cone" becomes an area template, anchored on
  the caster and their facing, so pressing cast lays the cone on the
  board, the player turns to aim it, and the engine knows who is in
  it; a creature's reach and senses become numbers the board can use.
  The spec is the typed system data; whether it is declared as Rust
  types alone or as a small declarative language that the types are
  generated from (the shape a form builder over OpenAPI grows into,
  once business logic needs a place) is open until the Open5e data
  has been used in anger. Until then the facets, parts and kinds in
  the manifest are the first, declarative, slice of that spec.

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
  excluding them ("giant" still finds Giant Spider, a beast). When a
  value word turns into a filter follows from what is *in play*: a
  kind named by a noun ("creatures"), by the operator syntax, or
  implied by a bound on a facet only some kinds carry ("cr 5+") puts
  those kinds in play, and a value of a facet they carry then filters
  ("giant creatures", "undead cr 5+"). A word the system declared
  itself, an alias like cantrip or a yes/no fact like ritual, is sure
  of its kind and always filters. Out of play, the word stays search
  text. The category tab is a view over one answer (its counts come
  from the same search), so it does not put its kinds in play; whether
  a bare value word typed on a tab should filter is left to
  playtesting, since it would mean sending the tab to the core.
- **The tray.** Inside the box under the category tabs, scrolling away
  with the tiles as one column, never an overlay over the compendium
  leaf. It opens on the funnel button or when typed words match a
  filter, and stays shut on the All tab until user testing says
  otherwise. One control per facet the manifest declares for the
  category, in the manifest's order, chosen by the kind of fact. A
  *span rail* for a short ordered scale (level, size, rarity): a click
  toggles that cell, as a chip does, and nothing else; a run of
  adjacent cells reads as a range and cells apart as either, and a
  run reaching an end of the rail is open (level up to 2). Every
  multi-select in the tray toggles the same way, so a click never
  means two things, and there are no Shift or drag gestures to learn. A *switch rail*, the same strip with each cell its own
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
- **A scene is one map and everything the table knows about it.** The
  picture and its grid; the record of strokes and the height display;
  the tokens standing on it; the play state, what changed in play and
  is not a stroke: a door opened, a window smashed, later fog lifted
  and lights lit; and the encounter *(later)*: initiative, whose turn
  it is, the movement spent. What belongs to a viewer, a ruler,
  provisional steps, private marks, is not the scene's. Each scene is
  a file of its own under `scenes/`; the table has one open at a time
  and remembers which. The DM creates a scene blank, from a picture,
  or from a reference drawing, and imports *(later)* arrive as
  strokes. Switching is the DM's act; players follow *(later)*.
- **Which scene you are in.** A small scene tab at the top left of the
  board names the scene on show, for players and DM alike; when
  players are connected it carries a small mark per player viewing
  that scene, since a DM may let players view more than one. Players
  see one tab, sometimes a couple. The DM's full list lives in the
  DM screen's Scenes leaf, in the manner of Foundry's scene
  directory: folders (prepared, unfinished, old), a thumbnail per
  scene with its name over it, create and search on top, and the
  player-facing tab repeated for quick reference. The tab ships with
  the PoC and, for the DM, opens the list until the leaf exists; the
  marks and the leaf come with players and the surfaces.
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
- **The board draws on request.** Nothing is drawn while nothing
  changes, so an idle board costs neither processor nor graphics
  card, in the app and in a headless test alike. A change asks for a
  frame, and every ask made before the next screen refresh is drawn
  together, once. While the pointer pans, drags, measures or places
  a template, the asks come every refresh, so the board draws at
  full rate. Asks come from input on the board (pointer, wheel,
  keys), from the host after every change it makes, and from what
  changes on its own: the hold-to-turn timer, a picture that
  finishes loading, a theme, a resize (drawn at once, since resizing
  the canvas blanks it). Something that animates, such as a
  flickering light *(later)*, asks every refresh while it runs. Pixi
  tests pointer hits against the last frame drawn, which input
  asking for a frame keeps current. Decided 2026-09-11 (user) as the
  way to try first and feel in play; if a change that fails to ask
  ever shows late, the fallback is a slow heartbeat while idle, two
  frames a second.
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

### Topology and measurement

The scene knows its space: what can be stood on, crossed and seen
through, and how high it is. The DM adds that information to a map
picture; the picture carries the look, and the data shows only where
it adds something. Setting up a simple map from nothing is the same
tool used quickly. Settled 2026-09-07 over four interactive mocks;
the rounds are in the local research file.

- **The record is strokes.** Every addition the DM makes is a
  stroke: an undoable, editable operation with its own visibility.
  The ground grid, the edges, the elevation field and the movement
  graph are derived from the strokes in order; Undo drops the last,
  removing any stroke rebuilds without it, and the scene keeps the
  strokes as its history. Imports (Universal VTT walls *(later)*)
  arrive as strokes. The scene document stores the strokes; the
  derived rasters are rebuilt on load and on edit, cheap at map
  scale.
- **Six inks, one tool.** Build mode, DM only, holds one drawing
  tool: a shape (brush, rect, free shape, line, click) and an ink
  that names what the stroke means for movement and sight.
  *Ground*, with a state: ground; difficult (double cost); air
  (fliers only: the gap between floating islands, a floor a spell
  took); void (nobody; outside the scene). A cell with no ground
  drawn on it is ground. *Threshold*, clicked onto a cell edge: a
  kind (door, arch, window, frosted window that blurs sight) and a
  state (open, closed, locked, secret); windows always
  pass sight, and a large window is forcible, dived through open or
  smashed shut by an action taken in play that the route never
  plans, while a small one is sight only; walls are forcible the
  same way by those strong enough. *Wall*, a line on the grid or a
  rect that draws four at once; walls are explicit, nothing derives
  them. *Height*, an amount written into the field. *Level change*
  (placeholder name), where a change of height is walked rather
  than climbed: stairs, ramps, ladders, lifts. *Free*, ink with no
  rules meaning. Play mode holds Move and Ruler and reads what was
  drawn.
- **Data, and texture too.** A rules ink is data the board reads,
  and every one of them may also paint what it means onto the
  picture, chosen per stroke: a wall drawn where the art has no
  wall, difficult ground hatched where the art shows plain floor. A
  map whose art already draws its walls keeps them as data only,
  the quiet hint of Play; a map that does not gets the texture as
  well. Free ink is texture and nothing else. Decided 2026-09-10
  (user): some maps have the natural points for the walls and some
  do not, so data and texture are each a choice.
- **Every ink knows its place upward.** An area ink may sit at a
  height, in the distance unit of the system, and has none by
  default: Ground and Free ink carry one. A Ground stroke with no
  height changes the state alone, so difficult ground painted over
  a hill keeps the hill. With one, it also writes the field under
  every cell it paints, the very cells its shape or brush converts,
  and clears any level change there, as the Height pen would. A
  platform is then one stroke, ground at +10, where before it took a
  second pass with the Height pen. That pen stays for maps whose art
  already draws the floors and wants only the data added. Free ink
  at a height reads as nothing yet; it waits for floors *(later)*.
  A level change carries no number: its two ends are the field on
  either side, inferred as the foot of a wall is.
  An edge ink carries how tall it stands instead: a wall or a
  threshold has its foot on the ground under it, read from the
  field, so what it needs is its tallness, and that has no limit. A
  door may be two feet tall or twenty, a wall grandiose, by the size
  of whoever built the place. Nothing reads tallness yet; sight
  over a low wall and the first-person view will. Every pen keeps
  its own amount, since a map is built one pen at a time. Decided
  2026-09-11 (user): a map built in Tablewright puts its ground at a
  height in one stroke, and its walls and doors as tall as the
  place wants.
  Decided 2026-09-12 (user): both defaults hold wherever a stroke says
  nothing, in the record and on the way in from a file, so a map is set
  up by not setting it up. A DM without the time to build one throws a
  picture down and puts the players on it: the ground is level, the
  walls reach the ceiling, and moving either is a deliberate act.
- **Elevation is a field.** Continuous and sub-cell, eight samples
  to a cell (a fixed fraction of the cell, never the image's
  pixels), painted or traced. Contours and shadows are its
  iso-lines, so they follow the art's own curve and never a cell
  edge: organic maps are the normal case. The rules read the field:
  a cell's height is the field at its centre, a token's is the
  field under it, gridless play reads it with no cells. Adjacent
  cells more than a step (5 ft) apart are a climb up or a drop down
  unless a level change is painted across them.
- **Vertical edges have kinds**, priced by the mover and the
  system's numbers: step (walked), climb (2:1 without a climb speed,
  1:1 with), drop (free, 1d6 per 10 ft and prone, taken by choice),
  vault, jump (Strength), fly, trapdoor *(later)*. The numbers are
  manifest parameters; the diagonal rule is a campaign setting with
  the manifest's default (5e: every square 5 ft).
- **A measurement gives three answers.** Distance, in 3D under the
  campaign's rule (the greatest of the three axes for 5/5/5; the
  1.5 rule and exact extended the same way, as Fantasy Grounds
  does); line of effect, the straight segment against walls and
  shut thresholds; movement cost, the shortest route through the
  graph priced for the mover. Entries declare which their range
  uses. Distance between tokens is between the cells they occupy,
  so big creatures measure right.
- **Moving shows movement only.** Dragging a token shows one route
  and one number, with a drop's dice when there is one. The route
  is chosen in tiers: the safe way if this turn's movement covers
  it, else the shortest if that fits, else the same two with a
  dash, else refused; when both fit, the way the drag went picks,
  recent motion counting most. A token only ever lands where it is
  dropped: past the movement, the drop asks "Use dash?", yes moves
  and spends the action, no cancels; beyond a dash it cancels; Esc
  cancels a drag. Key steps (arrows, WASD) move one cell with no
  pathfinding and are provisional: stepping back removes a step,
  Esc retracts them, left-right-left-right is 0 ft, until an action
  (Space; a sheet action at the table), a drag, or the end of the
  turn commits them into the turn's history, drawn thin with a dot
  at each commit, where a drop becomes real. Shift with a key plans
  without moving. One Esc always cancels provisional movement.
- **Measuring is its own tool.** The ruler (R, or under Move in the
  rail) measures from a token or the floor without moving anything.
  Picking it opens a second column beside the rail with its modes,
  as Foundry does: Line, the default, measures as the crow flies,
  with an arrow at its far end, a bar across it where a wall or a
  shut door breaks the line of effect and the line faint beyond;
  Path shows the way on foot as this turn offers it, chosen in the
  tiers a move is (below), drawn as the line is in three bands: the
  plain colour as far as the movement left this turn reaches, the
  brass of a selected token as far as a dash would, red past even
  that, and dashed where it drops; its badge names the cost, led by
  Dash when it takes one, with the dice of a drop, and says so when
  the way is beyond even a dash. Red is the one colour with a
  meaning of its own on the board, and it means only that: a player
  reads it as where they cannot go this turn, while still seeing how
  far the thing is. One badge beside the far end carries the number, the
  rise beside it as an arrow up or down when there is one, and
  nothing more: a player reads it at a glance, and the everyday
  question is how far a thing is. A measure stays until Escape or
  the next one. Rulers are public by default; Alt makes one private,
  fainter and dashed; a measure touching a hidden token is private
  whatever the modifier *(later, with token visibility)*. Decided
  2026-09-11 (user): the crow-flies line is the everyday measure and
  the route belongs to moving, so the ruler shows one answer at a
  time, never all three at once.
- **Templates are areas, laid down from the same column.** Rectangle,
  Cone and Circle each have their own item beside Line and Path, which
  measure and lay nothing down. All five are pressed, dragged and
  released: what separates an area from a measure is not the gesture but
  what happens after, since a measure answers and is gone while an area
  stays. The press puts the origin down, the drag aims it and says how
  far it goes — the length of a rectangle or a cone, the radius of a
  circle, which takes no aim — and the release leaves it there; a press
  inside one already on the board takes hold of it and moves it. An area
  still under the hand draws its edge in brass and settles to the ink's
  own white once it is down, so the one being drawn out and the one
  already lying there never read the same. Each carries its own sizes: a
  rectangle a length, a width and a height; a cone a length and a
  spread, the spread a slider from nought to ninety degrees and its far
  edge round or flat, round by default since a round edge keeps
  everything inside the range; a circle a radius and an inner radius,
  which always sits inside it, whether that radius was typed or dragged,
  since a hole as wide as the area swallows it and a ring that catches
  nothing is nobody's intent. A template starts on the token its caster
  holds, or the one a player owns, and where there is neither it goes
  where the palette says it may: the middle of a cell, a corner of the
  grid, or wherever it was pressed, the middle by default, and the same
  snap holds while it is moved, and it is carried by the offset it was
  taken hold of at rather than jumping under the pointer. The wheel
  turns one while the hand is on it, and the palette keeps its bearing
  as a number for a hand that would rather type one; the gesture is the
  everyday way and the number is there when it is wanted. An origin is a
  point or a token, which is also what an area that moves with a
  creature needs, and it sits in the middle of its own cube rather than
  on the floor, since that is where every cell it is measured against
  sits.
- **Every area has a vertical form**, chosen beside its sizes. A
  circle stands as a sphere, a dome or a cylinder: the dome is what a
  DM reaches for, since a fireball should not burn the cellar, and
  the sphere is the one that passes through the floor on purpose,
  over a chasm or above an open room. A cone is flat or 3D: flat is
  the footprint given a height, 3D spreads upward as it spreads
  sideways. A rectangle has no form to choose: its length, width and
  height already say everything, and the height is whatever the effect
  says, a wall of fire being twenty feet, falling back to its own width
  where the effect says nothing. A ring is an inner radius beside the
  radius rather than a form of its own, nought meaning a full disc; with
  a cylinder it is a tube and with a sphere a shell.
  What the world then does to a volume is a second question from its
  shape: clipping it to the ground is what makes a sixty-foot cone
  fired down a ten-foot corridor behave like the one a player
  pictures, and stay a cone across a canyon.
- **A cell is caught when the volume holds the centre of its cube**,
  and then everything standing in that cell is caught. It is one test
  in three dimensions rather than a family of grid rules, it reads
  plainly to a player, and it is a campaign setting beside the
  diagonal rule, so a system that counts differently says so. The
  tokens an area holds wear a dashed brass ring, turning slowly, a
  little clear of their own: the token's ring keeps its own meaning
  and the dashed one says only that this one is caught.
- **Every measure and every area says who sees it**: everyone, the DM
  alone, or the one who made it, and everyone by default. Alt is the
  shortcut for one's own, as it already is for a private measure. The
  choice is the one on the board's as much as the next one's, so a
  measure already taken is shared by saying so rather than by taking it
  again, and the row follows whatever is down, Alt's own choice
  included. What is not the whole table's reads fainter on the board,
  with a word beside the numbers saying which, so the one who made it
  can see at a glance what the table cannot. The first two choices are
  the compendium's own tiers, judged by the rule that already decides
  which strokes a viewer sees; the third is about the hand that made the
  thing rather than how open it is, so it has no tier of its own. Until
  the table is networked the maker is the side of it the page was
  standing at, and only while the page looks through its own eyes: a
  mirror of the other side is nobody's maker, so it shows what that side
  sees and nothing besides.
- **The engine is not a 5e engine.** A shape is its settings, a
  spread and an edge and a form, and what 5e means by a cone is one
  place on that slider. 5e is first because two SRDs exist to seed
  real content from, not because its readings are the target; a
  system that wants a quarter-circle cone or a different cover rule
  sets them and the engine does not care. Decided 2026-09-12 (user),
  with the round's canvas and `.plan/RESEARCH.templates.md` behind it.
- **Effects on an area** *(later)*: the animated kind, fire fanning
  out along the shape it covers. Not built now, and the model must
  not make it hard: an area keeps a stable id, its geometry as
  separate fields rather than a blob, its far end measured, and its
  vertical profile, so something later can hang off any of them.
- **Height is displayed per scene.** A scene chooses how height
  shows over its picture: Shaded (a soft shadow on the low side and
  a hairline; the default), Washed (a tint per height band, for
  cells-and-walls maps with no texture), Marked (hairline and small
  edge tags, for art that draws its own cliffs), Data only. Token
  height is a badge. A strength setting fades the whole overlay.
  Hatching was tried twice and struck as too busy. The DM alone has
  a Topology view besides (placeholder name), a data check rather
  than a look: the picture and every texture muted hard, each cell
  printing its height, a level change printing stair, the badge as
  it is. It reads the field of the scene as the display does; it is
  another picture of the same data. Decided 2026-09-11 (user).
  Decided 2026-09-12 (user): it is a different mode of viewing
  rather than a setting of the display, so it is its own item in the
  rail, under the Ruler, and not a control in the Height pen's
  palette; and it is the DM's alone, not a thing a player may be
  given. Its toggle belongs to the DM and never to the scene, so it
  survives every change the scene reports and no one else inherits
  it; and it does not take the scene's strength, since a data check
  faded is a worse data check. Every texture reads as its own data
  hint while it is on, which is how the picture underneath is
  uncovered without losing what the rules read.
- **Where it runs.** The board holds the queries that answer while
  the pointer moves (no IPC between the pointer and the pixel); the
  core holds the record and, with movement rules, the validation
  twin (§3: once in Rust, once on the board). WebAssembly stays the
  route to one implementation if the two drift.
- **Open** *(later)*: levels, as floor tabs with a level change
  linking two floors, open cells that see and fall through, and
  possibly a side-view strip beside the plan; which sheet actions
  commit provisional movement; whether a token's history shows to
  other players; filling the field from the art with a wand; a
  staircase that repeats over several floors of one layout, a
  tower or a library, and how one stroke stands for it.

### First-person view *(later)*

Players may switch to a first- or third-person camera on their own
token, rendered by a three.js module in the browser player client
that loads only when the mode is entered. It is a second view of the
same scene document, never a second source of truth.

- Walls extrude to the height each stroke carries; the map image is the floor;
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
  the token model ref; wall height is on the stroke already. Token
  facing already exists on the board model.

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
  board packages as Table, a static Vite build, no Tauri. Until it
  exists, the Table page served without Tauri *is* the player view
  (decided 2026-09-03): the party tier, no DM chrome (no Open map, no
  Place on board, no Reveal), the fixtures at party visibility, and the
  demo tunnel (`bun run demo`) is how a phone or a guest reaches it.
  When networking lands the same page connects to the DM's process and
  the fixtures fall away; the DM's own view stays in the Tauri window.
  In a dev build a toggle under the campaign chrome stands the page at
  either side of the table, mirroring what a player has: the board at
  the party tier, so a stroke, a token, a measure or an area the DM kept
  back drops off it and the DM's reading of the field goes with them;
  the rail without the pens, undo or history; no Open map and no
  Campaigns; and the compendium answering as it would for a player. It
  is how a DM sees their own table as the party does without a second
  machine. Two things are open (user, 2026-09-12): visibility wants a
  pass of its own so that one notion runs through every surface rather
  than each keeping a flag, and once a page is served to players what
  makes a view the DM's has to be proved rather than asked for, since a
  query string is something a player can type. Whether the DM client
  keeps a way to see what a player sees, once there are real players to
  see it for, belongs to that pass too.
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
  reduced. So there are two share actions, side by side wherever an
  entry can be shared (a tile, an entry page, a card): *Share* sends
  the player view and is the one everyone has; *Reveal* sends the
  everything view and only the DM has it. Two buttons rather than a
  mode, so nothing is revealed by accident and the DM never has to
  remember which state they are in (decided 2026-09-03).
- **Grants (later).** A reveal is a one-off: a card, seen once. Some
  access is ongoing: a player whose character keeps a pet bear needs
  the bear's block, normally DM material, in their own compendium for
  as long as they have the bear. That is a *grant*: the DM gives one
  named player (or the party) access to one entry, or to its data,
  and the visibility rule becomes tiers plus grants. Every query and
  message honours grants as it honours tiers, so the bear turns up in
  that player's search and nobody else's. Grants need the player
  model of the session, so they land with networking; the entry's
  `visibility` and `data_visibility` stay the baseline they override.
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
3. **Topology and measurement** — the scene's strokes (ground,
   thresholds, walls, height, level changes, free ink) and what
   derives from them: the elevation field, the edges, the movement
   graph; Build mode with the drawing tool; the ruler's three
   answers; moving with one route, the dash ask and provisional key
   steps; height displayed per scene. Templates follow, bound to
   the field.
4. **Dynamic lighting** — visibility polygons against the walls and
   shut thresholds stage 3 drew; darkness layer punched by light
   masks. The same edges later drive token vision.
5. **Dynamic sound** — ambient emitters with position/radius/falloff;
   Web Audio gain/pan by distance to a listener token.

Search speed and board interactivity lead: stage 2 comes before the
tools so real content and real search are felt early, and every
stage carries a measured target.

Seed data: **D&D 5e SRD** (CC-BY-4.0; machine-readable via the 5e SRD
API / Open5e). The first compendium file is generated by script.

**Acceptance scene:** load a tavern map, trace its ground, walls and
a door, raise a dais, find a goblin by search and drop it in with
two more tokens, measure a move onto the dais, splash a fireball
template, light a torch on a token, put crackling-fire ambience on
the hearth.

## 9. Milestones

1. **PoC** (§8).
2. **Compendium proper** — envelope + visibility + provenance,
   faceted search UI, hardened SRD pipeline.
3. **Vault v1** — the Araitael vault (Obsidian + Bookspire export)
   imported, local, searchable.
4. **Multiplayer** (§6).
5. **Import** (§7).
