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
  board-wall: "#F1E6D266"
  board-threshold: "#C9A24E"
  board-sight: "#5FA8BD"
  board-difficult: "#F1E6D21F"
  board-air: "#5FA8BD47"

typography:
  headline-md:
    fontFamily: system-ui, Segoe UI, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
  headline-sm:
    fontFamily: system-ui, Segoe UI, sans-serif
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: system-ui, Segoe UI, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: system-ui, Segoe UI, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-md:
    fontFamily: system-ui, Segoe UI, sans-serif
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.04em
  numeric-md:
    fontFamily: ui-monospace, Cascadia Mono, Consolas, monospace
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.2
    fontFeature: "tnum"
  document-title:
    fontFamily: Georgia, Cambria, Times New Roman, serif
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.2
  document-label:
    fontFamily: system-ui, Segoe UI, sans-serif
    fontSize: 11px
    fontWeight: 600
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
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  document-title:
    textColor: "{colors.ink}"
    typography: "{typography.document-title}"
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

Tablewright is a virtual tabletop and worldbuilding suite. The
governing idea is that using it should feel like sitting at a
physical table. It cannot be that one to one, and it should not try
to be, but every element is based on a thing a real table has: a
desk, paper, ink, brass instruments, glass, dice, a map. Nothing is
a generic widget when it could be an object.

Its look is therefore a desk with paper on it. The desk is the tool
chrome: dark, warm, worn, and quiet, so it never competes with the
map. The paper is every document a player or DM reads: character
sheets, handouts, notes, compendium entries. Paper is light,
textured, and lively, and it lies on the desk the way a printed
sheet lies on a table.

Four qualities govern every decision:

- **Recessive desk.** Tool surfaces are close in tone, outlines are
  hairlines, and brass is used sparingly: the selected token, the one
  primary action in a panel, the active tool.
- **Objects, not widgets.** Paper should read as paper, brass as brass,
  glass as glass. Materials carry texture, edge, and light; flat
  colour is the placeholder we ship first, not the destination.
- **Instruments, not cards.** Every section of a document has its own
  silhouette, chosen for what it holds and for the character's class:
  a spiral gauge for hit points, bolts and gears for an artificer's
  scores, chained rings for equipment. Uniform rounded cards are the
  failure mode.
- **Instant.** Panels are pre-mounted and open in the same frame.
  Materials are painted once and never animated. No spinners between
  local interactions.

The board keeps a neutral cool ground so map art is never tinted by
the desk. Fantasy craft is the first skin; other genres arrive later
as skins over the same tokens, and each character class gets a small
skin of its own for accent metal, washes, and instrument shapes.

The system is implemented as Lit web components with hand-written CSS
in `packages/ui`; the board reads the same tokens into PixiJS through
a bridge in `packages/board`. Tokens are generated from the front
matter above into `packages/ui/src/tokens.css` as `--tw-*` custom
properties by `tools/build-tokens.ts`; that file is never edited by
hand.

## Colors

Two palettes share one document: the desk and the paper.

The desk is a warm near-black ramp, `background` through the
`surface-container-*` steps, with `on-surface` in warm cream and
hairlines in `outline`. Panels, toolbars, search, and menus live here.

- **primary**, brass, is selection and emphasis on the desk and the
  metal of the paper's fittings.
- **secondary**, teal glass, is information and secondary affordances:
  links, readouts, measurement, the inactive tool.
- **tertiary**, copper, is warmth and rank: the artificer's accent,
  rules under titles, proficiency marks.
- **error** is failure and destruction only.

The paper is `paper` with `paper-deep` and `paper-shade` for depth,
and `ink`, `ink-soft`, `ink-faint` for text and linework. The washes,
peach, rose, sky, moss, and lilac, tint whole sections at low contrast
so a busy sheet separates by hue temperature rather than by borders.
Each wash has a light stop for gradients, and washes are always soft
two-stop gradients, never flat fills.

The board tokens stay neutral: `board-ground` is a cool dark step,
`board-grid` carries its own alpha in eight-digit hex, and
`board-selection` and `board-hover` are brass so the one accent is the
same on the desk and on the map. What the DM draws over the map stays
quiet under play: `board-wall` is paper at a low alpha, a hint over art
that draws its own walls; `board-threshold` is brass, since doors and
arches are what the data adds; `board-sight` is the secondary teal for
what sight passes through, windows; `board-difficult` and `board-air`
are faint tints carrying their own alpha.

Colour never carries meaning alone. Every status colour is paired with
an icon, a label, a shape, or a position.

## Typography

System sans-serif for the desk, so tool text never argues with a
map's lettering. A serif for document titles, so paper reads as
print; `document-title` uses system serifs until a bundled face is
chosen. A tabular monospace for numbers that change, so digits stay
still.

- `headline-md` and `headline-sm` name panels and sections on the desk.
- `body-md` is the default reading size; `body-sm` for dense lists.
- `label-md` is buttons, tabs, and field labels; `document-label` is
  the tracked small capitals of a sheet's section names.
- `numeric-md` is any live number.
- `document-title` is the character's name and handout headings.

Two weights only, regular and semibold. No italics for emphasis.

## Layout

An 8 px rhythm with a 4 px half step. Desk panels are 320 px wide,
dock to the window edges, and float over the board without dimming
it. Documents are wider and laid out as designed compositions, not
auto-grids: a sheet has a large central instrument and smaller ones
around it, asymmetric on purpose, the way the reference sheet gives
the spiral a whole quadrant.

- `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32.
- Panel padding is `lg`; document padding is `xl`; controls sit on
  `sm` gaps.

## Elevation & Depth

Depth on the desk is tonal: a lighter container on a darker ground
with a hairline border; nothing casts a drop shadow over the map.
Paper is the one thing that sits above the desk, and it earns a
soft contact shadow because a sheet on a table has one. Materials
supply the rest of the depth: bevel and specular on brass, a fibre
texture and edge darkening on paper, translucency on glass.

## Shapes

Desk controls use small radii: `sm` for controls, `md` for panels,
`lg` for paper corners. On paper, shape is meaning. Instruments are
drawn as vector frames with material fills: hexagonal nuts and bolts,
gears, rings, spirals, pipes and chains as separators. Tokens on the
board are circles with a brass ring. Never mix sharp and rounded
corners inside one surface.

## Materials

This section is direction for the finished product; the PoC ships
flat colour from the tokens above.

- **Paper**: a static fibre texture at low contrast, a faint vignette,
  slightly uneven edges by SVG mask, ink lines with a hand-inked
  waver from a static displacement filter, washes blended with
  multiply and darkened at their edges the way watercolour dries.
- **Brass and copper**: multi-stop metallic gradients with a single
  top-left specular, a bevel from inset shadow or an SVG lighting
  filter over a bump map, and a light patina noise. Rivets are small
  radial highlights.
- **Glass**: translucent teal over whatever sits beneath, an inner
  glow, and one highlight streak.
- **Rules**: materials are static assets or static SVG filters,
  painted once and cached. Nothing animates a filter, and nothing on
  the board uses them. Textures are small tiles, never full-size
  images.

## Components

- **panel**: desk container for search, tools, and settings. Container
  tone, hairline border, `md` corners, `lg` padding, a small tracked
  label as its title.
- **button-primary**: brass on dark text, `label-md`, one per panel at
  most. Hover uses the pale brass container tone.
- **button-quiet**: the default button, a tonal step up from the panel.
- **input**: the lowest desk tone so the field reads as a well, with
  `focus-ring` on focus.
- **document**: paper, ink text, `lg` corners, `xl` padding, a serif
  `document-title`, and `document-label` section names.
- **section-peach**, **section-rose**, **section-sky**, **section-moss**:
  washed regions inside a document, each drawn as an instrument frame
  rather than a card.
- **board**: the canvas; its ground and grid come from the board tokens
  through the bridge, not from CSS.
- **notice-error**: an inline error strip that says what went wrong,
  what was expected, and what to do; never a modal.

## Do's and Don'ts

- Do keep the desk recessive: if a control competes with the map, it
  is too loud.
- Do give every document section its own silhouette; if two sections
  could swap frames without loss, the design is not done.
- Do reference semantic tokens in components (`{colors.primary}`),
  never raw hex, so a skin is a handful of overrides.
- Do drive visual state with attributes and custom properties; never
  write inline styles for state.
- Do pair colour with shape, icon, or label for every status.
- Do keep numbers in `numeric-md` so they stay still while they change.
- Don't tint the board with the desk palette; map art is never warmed.
- Don't use uniform rounded cards on paper.
- Don't show a spinner for a local read; show the content or a named
  degraded state.
- Don't animate materials or filters, and don't put materials on the
  board.
- Don't invert the dark desk to make a light one; paper is the light
  surface.
