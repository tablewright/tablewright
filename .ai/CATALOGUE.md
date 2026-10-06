# Catalogue: what exists, before you write

Written by `bun run catalogue` from the doc comments, never by hand.
Grouped by feature, then file, then name; a file's folder says its
layer. A UI file sits under the one feature that takes it in, and
under `shared` once a second does. Look here first, then search the
package, then write. [REUSE.md](REUSE.md) says why.

## UI: shared

What more than one feature takes. `packages/ui/src`.

**atoms/icons.ts**
- `ICON_STYLES`: What a host has to add to its own styles for either hand to sit right.
- `rulerIcon()`: The glyph for a way of measuring.
- `inkIcon()`: The glyph for an ink.
- `shapeIcon()`: The glyph for a shape an ink is drawn in.
- Also: `MAP_ICON`, `CLOSE_ICON`, `FILTER_ICON`, `SHARE_ICON`, `MOVE_ICON`, `UNDO_ICON`, `HISTORY_ICON`, `SHOWN_ICON`, `KEPT_ICON`, `TOPOLOGY_ICON`, `RULER_ICON`

**atoms/styles.ts**
- `PANEL_CHROME`: A panel's chrome: the outline, the panel's corners and its surface.
- `QUIET_BUTTON`: The quiet button: an outlined label on the desk, for every action but the one.
- `QUIET_BUTTON_HOVER`: How a quiet button lights under the pointer.
- `MENU_ITEM`: A menu's item: borderless and left-aligned, lit only under the pointer.
- `FOCUS_OUTLINE`: The focus ring's outline alone, for a rule that rings one kind of thing at an offset of its own.
- `FOCUS_RING`: The focus ring, as one rule for a whole shadow root.

**atoms/tw-strip.ts**
- `STRIP_STYLES`: The strip's rail and cells as rules, for a host that draws the same cells by hand.
- `TwStrip`, `<tw-strip>`: A strip of cells under a label: the search tray's rail and switch control, shared so the palette's option groups read the same.

**utils/dismiss.ts**
- `DismissWhenOutside`: Shuts the host's menu when a press lands outside the host; the host adds it as a controller.

**utils/events.ts**
- `emit()`: Send `name` from `host` with `detail`, bubbling and crossing shadow roots so the app hears it on the element.

**utils/preview.ts**
- `categoryOf()`: The category a kind is grouped under.
- `previewOf()`: What a tile shows for `hit`.
- `groupHits()`: Group ranked hits by category.
- Types: `Taxonomy`, `TilePreview`, `HitGroup`

**utils/searcher.ts**
- Types: `SpotlightHit`, `SearchAnswer`, `Searcher`

**utils/text.ts**
- `titleCase()`: A value as a label: the first word capitalised, hyphens as spaces.
- `wordsCase()`: A value as a heading: every hyphen-separated word capitalised, hyphens as spaces.
- `nameFrom()`: The name a form was given, trimmed, or nothing when it is blank or `form` is not a form.

## UI: campaigns

**components/campaigns/tw-campaigns.ts**
- `TwCampaigns`, `<tw-campaigns>`: The intro: the campaigns the app knows, to bring one to the table, make a new one, or open a folder the DM keeps elsewhere.

## UI: entry

**components/entry/sections.ts**
- `groups()`: Group consecutive sections by label, keeping their order.
- Types: `SectionGroup`

**components/entry/tw-entry-view.ts**
- `TwEntryView`, `<tw-entry-view>`: A compendium entry as a page: the paper leaf the desk turns to.
- Types: `EntryDocument`

## UI: rail

**atoms/panel-styles.ts**
- `COUNT_PILL`: The count pill: a number in the rail's colour, on the rail's foot and the history's head.
- `PANEL_STYLES`: A panel and everything in it, for each of the rail's panels to take in whole.

**atoms/tw-readout.ts**
- `TwReadout`, `<tw-readout>`: What is under the pointer, in words, in the corner below the rail.

**components/rail/tw-tool-rail.ts**
- `TwToolRail`, `<tw-tool-rail>`: What the pointer does on the board.

**molecules/panel-inputs.ts**
- `stripRow()`: A strip of choices under its caption, which names the strip unless an `aria` says otherwise.
- `strip()`: The strip alone, for a section that holds more than one thing.
- `numberRow()`: A number typed into a box, under its caption.
- `rangeRow()`: A number dragged along a slider, under its caption.
- `field()`: The field alone, the box or the slider with its unit after it, for a section that holds more.

**molecules/pen-palette/swatches.ts**
- `thresholdSwatch()`: A threshold as the board will draw it, on a 28 px grid.

**molecules/pen-palette/tw-pen-palette.ts**
- `TwPenPalette`, `<tw-pen-palette>`: The panel beside a held pen: its shapes, what it shows as, where it sits, and its own options.

**molecules/tw-ruler-column.ts**
- `TwRulerColumn`, `<tw-ruler-column>`: The panel beside the ruler's modes: an area's own sizes, and for every mode who sees it.

**molecules/tw-stroke-history.ts**
- `TwStrokeHistory`, `<tw-stroke-history>`: The scene's strokes, newest first, opened from the rail's foot: what was just drawn is what the DM wants back or gone.

## UI: scenes

**components/scenes/tw-scenes.ts**
- `TwScenes`, `<tw-scenes>`: The scene tab: names the scene on show for everyone and, for the DM, opens the list of scenes to switch, add a blank one by name, or add a reference drawing as a scene.

## UI: share

**components/share/tw-share-tray.ts**
- `TwShareTray`, `<tw-share-tray>`: Where shared entries land: one card at a time, the rest queued behind it, the next stepping up when the current one is dismissed.
- Types: `Share`

**molecules/tw-share-card.ts**
- `TwShareCard`, `<tw-share-card>`: The card everyone at the table sees when an entry is shared: paper on the desk, who shared it, the entry's summary, and a way to dismiss it.

## UI: spotlight

**components/spotlight/keys.ts**
- `step()`: The selection `delta` tiles on from `selected`, wrapping at both ends as Spotlight does.
- `answerKey()`: What the box does with `press` at `place`.
- Types: `KeyPress`, `KeyPlace`, `KeyEffect`, `KeyAnswer`

**components/spotlight/styles.ts**
- `SPOTLIGHT_STYLES`: The box, whole.

**components/spotlight/tw-spotlight.ts**
- `TwSpotlight`, `<tw-spotlight>`: The search box: one input pinned to the left edge, the rest of the screen dimmed, hits as tiles two per row grouped by category, groups ordered by their best hit.

**molecules/tw-filter-tray.ts**
- `TwFilterTray`, `<tw-filter-tray>`: One control per facet the system manifest declares for the category.

**molecules/tw-hit-tile.ts**
- `TwHitTile`, `<tw-hit-tile>`: One hit as a tile: the name, its line, a ring or a badge at its foot, the version it stands in for, and a Share button.

**utils/filter-state.ts**
- `valueText()`: A facet value as a filter carries it, and as a cell is keyed.
- `cellKey()`: The key of a switch cell or chip: its facet and value.
- `activeCount()`: How many controls filter.
- `chipValues()`: The chip values a control offers: its declared stops, else the facet's values from the data.
- `filtersOf()`: The filters a tray state stands for, in control order.
- `besideIndex()`: A control's `beside` is addressed as its index plus a large offset.
- `selectionOf()`: What the typed words selected, as tray state: a display the tray shows until its own state for that control takes over.
- Types: `Tri`, `ControlState`, `TrayState`

## UI: tokens

**molecules/tw-dash-ask.ts**
- `TwDashAsk`, `<tw-dash-ask>`: The one question a move asks: a bar under the board saying what the way costs against the movement left, with the two answers.

**molecules/tw-token-menu.ts**
- `TwTokenMenu`, `<tw-token-menu>`: The right button on a token opens this beside it.

## Board: shared

The `shared/` files, whole. Under each domain after this, only the names that code in another domain runs. `packages/board/src`.

**shared/geometry.ts**
- `pointOn()`: Where a pointer event landed on `element`, in pixels from its top-left corner.
- `lengthOf()`: The straight distance from `from` to `to`, in whichever space both are in.
- `along()`: The point `t` of the way from `from` to `to`: 0 is `from`, 1 is `to`.
- Types: `Point`, `WorldRect`

**shared/listeners.ts**
- `Listeners`: The listeners of one event, added one at a time and told together.

**shared/pointer-session.ts**
- `PointerSession`: Binds a tool's pointer handling to the canvas while active.
- Types: `PointerSessionOwner`

**shared/seen.ts**
- `SEEN_BY`: What a measure or an area may be made for, as the palette offers them.
- `seesIt()`: Whether a role sees a thing marked `marked`, `isMine` when it is theirs.
- `allows()`: Whether a role may do this at all.
- `reachOf()`: How far a permission carries for this role: one's own, unless the file says wider.
- `KEPT_ALPHA`: How faint a measure or an area reads when it is not the whole table's.
- `seenByNote()`: What the board says beside a measure or an area that is not the table's, if anything.
- `withSeenByNote()`: `text` with the note for who a thing is for after a dash, when there is one.
- `keptAlphaIf()`: How a thing kept back from the table reads: faint when it is, plain when it is not.
- `keptAlpha()`: How a measure or an area reads by who it is for: plain for the table, faint for anyone else.
- `NO_ROLE`: A role that may do nothing and sees nothing, so a surface that is never told which role it serves shows nothing rather than everything.
- `NOBODY`: The seat before the app names one: NO_ROLE, so a board fails closed.
- `Marking`: Who a measure or an area is for, and whose it is: the palette's choice for the next one, the seat this board sits in, and what the one on the board was made as and by.
- Types: `Seat`

## Board: draw

**draw/gestures.ts**
- `edgeNear()`: The edge nearest a point, if one is within `reach` cells of it.

**draw/strokes.ts**
- `dashedLine()`: Lay the line from `from` to `to` down in dashes, since Pixi strokes have none; the caller strokes it.

**draw/tool.ts**
- `DEFAULT_TALL`: How tall an edge ink stands when nothing says otherwise: ten feet, the dungeon ceiling of convention.
- `signed()`: A height with its sign, as the tool and the record show it.
- `tidy()`: A length as a badge shows it: whole numbers stay whole, the rest keep two places.

## Board: grid

**grid/grid-lines.ts**
- `intersectExtents()`: The cells two extents share, or undefined when they share none.
- `forCellsInExtent()`: Visit every cell of `extent`, row by row and left to right within a row.

**grid/square-grid.ts**
- `worldToCell()`: The cell containing a world point.
- `cellToWorld()`: Top-left corner of a cell in world pixels.
- `cellCenter()`: Centre of a cell in world pixels, where a one-cell token sits.
- `snapToCellCenter()`: Snap a world point to the centre of the cell it falls in.
- `worldToCellPoint()`: A world point in cell coordinates, fractions and all: the grid's own measure.
- `cellPointToWorld()`: A point in cell coordinates, fractions and all, back in world pixels: the inverse of `worldToCellPoint`.
- `insetCell()`: A cell's square drawn in from its edges by `inset` of a cell, so neighbours stay apart.

## Board: ruler

**ruler/badge.ts**
- `Badge`: Figures on a pill, set beside a point.

**ruler/measure-view.ts**
- `MeasureView`: Draws one measurement into a container, in the mode it is read in.

## Board: theme

**theme/board-theme.ts**
- `FALLBACK`: The theme before one is read, and for any token missing or unreadable, so a broken theme still shows a board.

**theme/css-color.ts**
- `channelsOf()`: The red, green and blue of a packed 0xRRGGBB, each 0 to 255.

**theme/styles.ts**
- `topologyStyle()`: The topology layer's colours.
- `drawStyle()`: The drawing tool's colours: the hover for its preview, the threshold's brass for its ink.
- `rulerStyle()`: The ruler's colours and faces, which a token's drag draws through too.
- `numbersStyle()`: The Topology view's colours and face.
- `areaStyle()`: The area layer's colours and face.
- `heightStyle()`: The height display's colours and face.

## Board: tokens

**tokens/facing.ts**
- `normalizeDegrees()`: Normalise any angle in degrees into [0, 360).
- `facingToward()`: Facing that points from `from` to `to` in world space, or undefined when they coincide.

**tokens/token-sprite.ts**
- `tokenReach()`: How far a token's drawing reaches from its centre: past the disc and its ring, out to the tip of the arrow that shows which way it faces.

## Board: topology

**topology/derive.ts**
- `seenAt()`: Whether a thing kept at `tier` reaches `viewer`: a viewer sees everything at or below their own.
- `heightAt()`: The field at a cell's centre: the height the rules give the cell.

**topology/rules/cost.ts**
- `speedOf()`: The speed a turn budgets: the fly speed of a flier, else the walk.

**topology/rules/distance.ts**
- `distance()`: The distance between two places under `rule`, in the rule's unit.

**topology/rules/effect.ts**
- `cellCentre()`: The centre of a cell, in cell coordinates.
- `firstBlock()`: The first edge along the segment that stops `passage`, if any.

**topology/rules/route.ts**
- `routes()`: The safe and the quick route, the quick one only when it beats the safe one.
- `chooseRoute()`: Which route this turn takes, in tiers: the safe one if the movement left covers it, else the shortest; failing both, either with a dash; failing that, refused.

**topology/shapes.ts**
- `pointInPolygon()`: Whether a point lies inside a polygon, by the even-odd rule.

## Board: every domain

Each has an `index.ts` naming what it offers: `area`, `camera`, `draw`, `grid`, `map`, `move`, `ruler`, `shared`, `stage`, `theme`, `tokens`, `topology`.
