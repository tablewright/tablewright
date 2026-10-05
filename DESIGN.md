---
version: alpha
name: Tablewright
description: A dark, warm desk with paper documents on it. Tool chrome is worn wood and brass and stays out of the way; character sheets and handouts are parchment, ink, and watercolour washes, each section shaped like the instrument it is. The map and its tokens remain the picture.

colors:
  primary: "#C9A24E"
  on-primary: "#2A1D00"
  primary-container: "#5C4310"
  on-primary-container: "#E4C57A"

  secondary: "#5FA8BD"
  on-secondary: "#06212B"
  secondary-container: "#234A55"
  on-secondary-container: "#D6ECF0"

  tertiary: "#B5683E"
  on-tertiary: "#2B1206"
  tertiary-container: "#6E3A1F"
  on-tertiary-container: "#F0C7A4"

  error: "#D9634F"
  on-error: "#3A0B08"
  error-container: "#5A1E1A"
  on-error-container: "#F7D2CE"

  background: "#17130F"
  on-background: "#E9DFCF"
  surface: "#201A15"
  on-surface: "#E9DFCF"
  surface-variant: "#2A231C"
  on-surface-variant: "#A89A86"

  surface-container-lowest: "#120F0C"
  surface-container-low: "#201A15"
  surface-container: "#2A231C"
  surface-container-high: "#352C24"
  surface-container-highest: "#40362C"

  outline: "#4A3E33"
  outline-variant: "#362D25"
  focus-ring: "#E4C57A"
  shadow-paper: "#00000073"
  shadow-panel: "#00000059"
  scrim: "#00000059"

  paper: "#F1E6D2"
  paper-deep: "#E6D6BC"
  paper-shade: "#D9C5A6"
  ink: "#2E2118"
  ink-soft: "#5B4636"
  ink-faint: "#8C7462"

  wash-peach: "#F0C7A4"
  wash-peach-light: "#F6DCC6"
  wash-rose: "#E8B4A8"
  wash-rose-light: "#F3D6CF"
  wash-sky: "#A9D3DE"
  wash-sky-light: "#D6ECF0"
  wash-moss: "#BFCFA2"
  wash-moss-light: "#DFE6CD"
  wash-lilac: "#C9BEDC"
  wash-lilac-light: "#E6E0EE"

  board-ground: "#1B1D24"
  board-grid: "#8B8FA359"
  board-selection: "#C9A24E"
  board-hover: "#E4C57A"
  board-token: "#B5683E"
  board-token-label: "#F1E6D2"
  board-token-ring: "#D6AD8F"
  board-wall: "#F1E6D266"
  board-threshold: "#C9A24E"
  board-sight: "#5FA8BD"
  board-difficult: "#F1E6D21F"
  board-air: "#5FA8BD47"
  board-height-shade: "#000000"
  board-height-line: "#F1E6D299"
  board-height-up: "#E4C57A"
  board-height-down: "#5FA8BD"
  board-height-tag: "#F1E6D2"
  board-floor: "#F1E6D214"
  board-ruler: "#F1E6D2"
  board-beyond: "#C8553D"

themes:
  light:
    colors:
      primary: "#8A6A1E"
      on-primary: "#FBF6EA"
      primary-container: "#F0DFA8"
      on-primary-container: "#5C4310"
      secondary: "#2F7A8E"
      on-secondary: "#F2FAFC"
      secondary-container: "#D6ECF0"
      on-secondary-container: "#123A45"
      tertiary: "#2E2118"
      on-tertiary: "#FAF7F0"
      tertiary-container: "#E2DACB"
      on-tertiary-container: "#2E2118"
      error: "#B7412F"
      on-error: "#FFF4F2"
      error-container: "#F7D2CE"
      on-error-container: "#5A1E1A"
      background: "#DDE1E5"
      on-background: "#1F2226"
      surface: "#E4E7EA"
      on-surface: "#1F2226"
      surface-variant: "#D8DDE2"
      on-surface-variant: "#4E565E"
      surface-container-lowest: "#F7F8F9"
      surface-container-low: "#E4E7EA"
      surface-container: "#DCE0E4"
      surface-container-high: "#CFD4DA"
      surface-container-highest: "#C1C7CE"
      outline: "#5F6770"
      outline-variant: "#A4ABB3"
      focus-ring: "#6B520F"
      shadow-paper: "#00000033"
      shadow-panel: "#00000026"
      scrim: "#00000033"
      paper: "#FAF7F0"
      paper-deep: "#F0EBE0"
      paper-shade: "#E2DACB"
      board-ground: "#D9DDE2"
      board-grid: "#3B424C40"
      board-selection: "#8A6A1E"
      board-hover: "#B8902E"
      board-token: "#2E2118"
      board-token-label: "#FAF7F0"
      board-token-ring: "#2E2118"
      board-wall: "#2E2118B3"
      board-threshold: "#8A6A1E"
      board-sight: "#2F7A8E"
      board-ruler: "#2E2118"
      board-beyond: "#B7412F"

typography:
  headline-md:
    fontFamily: Libertinus Sans, system-ui, sans-serif
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.25
  headline-sm:
    fontFamily: Libertinus Sans, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.3
  body-md:
    fontFamily: Libertinus Sans, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: Libertinus Sans, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-md:
    fontFamily: Libertinus Sans, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.04em
  numeric-md:
    fontFamily: Fira Code, ui-monospace, Cascadia Mono, Consolas, monospace
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.2
    fontFeature: "tnum"
  icon-md:
    fontFamily: Material Symbols Rounded
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1
  document-title:
    fontFamily: Cinzel Decorative, Georgia, serif
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.25
  document-heading:
    fontFamily: Cinzel Decorative, Georgia, serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.3
  document-body:
    fontFamily: EB Garamond, Georgia, serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  document-label:
    fontFamily: Libertinus Sans, system-ui, sans-serif
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.08em
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  panel-width: 320px

rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 10px
  full: 999px

components:
  panel:
    backgroundColor: "{colors.surface-container}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  panel-title:
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  button-primary-hover:
    backgroundColor: "{colors.on-primary-container}"
  button-quiet:
    backgroundColor: "{colors.surface-container-high}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  input:
    backgroundColor: "{colors.surface-container-lowest}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  document:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.document-body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  document-title:
    textColor: "{colors.ink}"
    typography: "{typography.document-title}"
  document-heading:
    textColor: "{colors.ink-soft}"
    typography: "{typography.document-heading}"
  document-label:
    textColor: "{colors.ink-soft}"
    typography: "{typography.document-label}"
  section-peach:
    backgroundColor: "{colors.wash-peach}"
    textColor: "{colors.ink}"
  section-rose:
    backgroundColor: "{colors.wash-rose}"
    textColor: "{colors.ink}"
  section-sky:
    backgroundColor: "{colors.wash-sky}"
    textColor: "{colors.ink}"
  section-moss:
    backgroundColor: "{colors.wash-moss}"
    textColor: "{colors.ink}"
  board:
    backgroundColor: "{colors.board-ground}"
  notice-error:
    backgroundColor: "{colors.error-container}"
    textColor: "{colors.on-error-container}"
    typography: "{typography.body-sm}"
    padding: "{spacing.md}"
---

## Overview

Tablewright is a virtual tabletop and worldbuilding suite that should
feel like sitting at a real table. Not one to one, but every element is
based on something a table has: a desk, paper, ink, brass instruments,
glass, dice, a map. Nothing is a generic widget when it could be an
object.

So the look is a desk with paper on it. The desk is the tool chrome:
dark, warm and quiet, so it never competes with the map. The paper is
everything a player or DM reads: sheets, handouts, notes, compendium
entries. It is light and textured, and lies on the desk like a printed
sheet.

Four qualities govern every decision:

- **Recessive desk.** Tool surfaces are close in tone, outlines are
  hairlines, and brass is kept for the selected token, the one primary
  action in a panel, and the active tool.
- **Objects, not widgets.** Paper reads as paper, brass as brass, glass
  as glass. Flat colour is what ships first, not the destination.
- **Instruments, not cards.** Every section of a document has its own
  silhouette, chosen for what it holds and for the character's class:
  a filled bar for hit points, bolts and gears for an artificer's
  scores, chained rings for equipment. Uniform rounded cards are the
  failure.
- **Instant.** Panels are mounted ahead of time and open in the same
  frame. Materials are painted once and never animated. No spinners
  between local actions.

The board keeps a neutral cool ground so map art is never tinted.
Fantasy is the first skin. Other genres come later as skins over the
same tokens, and each character class gets a small skin of its own for
accent metal, washes and instrument shapes.

The system is Lit web components with hand-written CSS in
`packages/ui`, and the board reads the same tokens into PixiJS through
`packages/board`. `tools/build-tokens.ts` generates
`packages/ui/src/tokens.css` from the front matter as `--tw-*` custom
properties; that file is never edited by hand.

## Colors

Two palettes share one document: the desk and the paper.

The desk is a warm near-black ramp, `background` through the
`surface-container-*` steps, with `on-surface` in warm cream and
hairlines in `outline`. Panels, toolbars, search and menus live here.

- **primary**, brass: selection and emphasis on the desk, and the metal
  of the paper's fittings.
- **secondary**, teal glass: information and secondary affordances,
  such as links, readouts, measurement and the inactive tool.
- **tertiary**, copper: warmth and rank, such as the artificer's
  accent, rules under titles and proficiency marks.
- **error**: failure and destruction only.

The paper is `paper`, with `paper-deep` and `paper-shade` for depth,
and `ink`, `ink-soft` and `ink-faint` for text and lines. The washes,
peach, rose, sky, moss and lilac, tint whole sections at low contrast,
so a busy sheet separates by hue rather than by borders. Each wash has
a light stop, and a wash is always a soft two-stop gradient, never a
flat fill.

The board tokens stay neutral, and brass is the one accent on the desk
and the map alike:

- `board-ground` is a cool dark step, and `board-grid` carries its own
  alpha. `board-selection` and `board-hover` are brass.
- `board-wall` is paper at a low alpha, a hint over art that draws its
  own walls. `board-threshold` is brass, since doors and arches are
  what the data adds. `board-sight` is teal, for windows.
  `board-difficult` and `board-air` are faint tints with their own
  alpha.
- Height: `board-height-shade` is the shadow on the low side of a rise,
  `board-height-line` a contour hairline, `board-height-up` and
  `board-height-down` the warm and cool washes above and below zero
  with their alpha set by the height, and `board-height-tag` the text
  of a small edge tag.
- A stroke drawn as texture is the same paper made firm: `board-floor`
  is floor painted where the picture has none, and walls, thresholds
  and difficult ground are drawn solid and hatched rather than hinted.
- `board-ruler` is paper laid over the map like a tape, and a way
  within a dash wears `board-selection`. `board-beyond` is the one red
  on the board: a way past even a dash.

Colour never carries meaning alone. Every status colour comes with an
icon, a label, a shape or a position.

The light desk is the same tokens under `themes: light`, and only the
colours that change: a cool pale stone with ink hairlines drawing the
chrome, the board as graph paper, ivory paper, and the dark desk's
bronze become ink throughout, token and accent alike. Brass on a light
desk is a dark brass, so a pressed button carries cream text. Paper,
ink and the washes stay as they are. `shadow-paper`, `shadow-panel`
and `scrim` carry the shadows, since a light desk wants lighter ones,
and `board-token-ring` is a token's facing ring at rest.

## Typography

Five faces, chosen by where the reader is. The reasons are in
[docs/typography.md](docs/typography.md).

- **Cinzel Decorative** for headings on paper: `document-title` and
  `document-heading`.
- **EB Garamond** for the body of a page: `document-body`.
- **Libertinus Sans** for all of the chrome: `headline-md`,
  `headline-sm`, `body-md`, `body-sm`, `label-md` and
  `document-label`.
- **Fira Code** for every figure and the tags beside it: `numeric-md`,
  so digits stay still while they change.
- **Material Symbols** for icons: `icon-md`.

Libertinus Sans comes in 400 and 700, so labels are 700. No italics for
emphasis.

## Layout

An 8 px rhythm with a 4 px half step: `xs` 4, `sm` 8, `md` 12, `lg` 16,
`xl` 24, `xxl` 32. Panel padding is `lg`, document padding is `xl`, and
controls sit on `sm` gaps.

Desk panels are 320 px wide, dock to the window edges and float over
the board without dimming it. Documents are laid out as designed
compositions, not auto-grids: a sheet has a large central instrument
with smaller ones around it, asymmetric on purpose.

## Elevation & Depth

Depth on the desk is tonal: a lighter container on a darker ground with
a hairline border, and nothing casts a shadow over the map. Paper is
the one thing above the desk, with a soft contact shadow like a sheet
on a table. Materials supply the rest: bevel and highlight on brass,
fibre and darkened edges on paper, translucency on glass.

## Shapes

Desk controls use small radii: `sm` for controls, `md` for panels and
`lg` for paper corners. On paper, shape is meaning: instruments are
vector frames with material fills, such as hexagonal nuts and bolts,
gears and rings, with pipes and chains as separators. Tokens on the
board are circles with a brass ring. Never mix sharp and rounded
corners in one surface.

Every instrument keeps an index corner, as a playing card does: its
figure, plain and in `numeric-md`, in the same corner every time. The
shape can be anything so long as the number reads at a glance without
it. A value read off a round shape is slow, and two values compared
on concentric arcs are slower still, so the corner carries the figure
and the shape carries the character.

## Materials

Direction for the finished product. For now everything ships in flat
colour from the tokens.

- **Paper**: a static low-contrast fibre texture, a faint vignette,
  slightly uneven edges from an SVG mask, ink lines with a hand-inked
  waver from a static displacement filter, and washes blended with
  multiply and darkened at their edges the way watercolour dries.
- **Brass and copper**: multi-stop metallic gradients with one top-left
  highlight, a bevel from an inset shadow or an SVG lighting filter,
  and a light patina noise. Rivets are small radial highlights.
- **Glass**: translucent teal over whatever sits beneath, an inner glow
  and one highlight streak.
- **Rules**: materials are static assets or static SVG filters, painted
  once and cached, from small tiles rather than full-size images.
  Nothing animates a filter, and nothing on the board uses materials.

## Components

- **panel**: the desk container for search, tools and settings.
  Container tone, hairline border, `md` corners, `lg` padding, and a
  small tracked label as its title.
- **button-primary**: brass with dark text in `label-md`, one per panel
  at most. Hover uses the pale brass container tone.
- **button-quiet**: the default button, a tonal step up from the panel.
- **input**: the lowest desk tone, so the field reads as a well, with
  `focus-ring` on focus.
- **document**: paper, ink text in `document-body`, `lg` corners, `xl`
  padding, a `document-title`, and `document-label` section names.
- **document-heading**: subheadings inside a document, in `ink-soft`.
- **section-peach**, **section-rose**, **section-sky**,
  **section-moss**: washed regions inside a document, each drawn as an
  instrument frame rather than a card.
- **board**: the canvas. Its ground and grid come from the board tokens
  through the bridge, not from CSS.
- **notice-error**: an inline strip that says what went wrong, what was
  expected and what to do; never a modal.

## Do's and Don'ts

- Do keep the desk recessive: if a control competes with the map, it is
  too loud.
- Do give every document section its own silhouette; if two sections
  could swap frames without loss, the design is not done.
- Do reference semantic tokens in components (`{colors.primary}`),
  never raw hex, so a skin is a handful of overrides.
- Do drive visual state with attributes and custom properties, never
  inline styles.
- Do pair colour with a shape, an icon or a label for every status.
- Do keep numbers in `numeric-md` so they stay still while they change.
- Do give every instrument an index corner with its figure; never ask a
  reader to read a value off the shape alone.
- Don't tint the board with the desk palette; map art is never warmed.
- Don't use uniform rounded cards on paper.
- Don't show a spinner for a local read; show the content or a named
  degraded state.
- Don't animate materials or filters, and don't put materials on the
  board.
- Don't invert the dark desk to make a light one; paper is the light
  surface.
