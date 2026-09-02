---
version: alpha
name: Tablewright
description: Recessive, fantasy-neutral chrome for a local-first virtual tabletop. Dark tonal surfaces, hairline outlines, one brass accent. The map and the tokens are the star; the interface stays out of the way and never makes anyone wait.

colors:
  primary: "#D9A648"
  on-primary: "#2A1D00"
  primary-container: "#5C4310"
  on-primary-container: "#F5DEA6"

  secondary: "#7FA8C9"
  on-secondary: "#0B2436"
  secondary-container: "#274257"
  on-secondary-container: "#D3E6F5"

  error: "#E0665E"
  on-error: "#3A0B08"
  error-container: "#5A1E1A"
  on-error-container: "#F7D2CE"

  background: "#14151A"
  on-background: "#C9C7C0"
  surface: "#14151A"
  on-surface: "#C9C7C0"
  surface-variant: "#22252C"
  on-surface-variant: "#9A9A94"

  surface-container-lowest: "#0F1013"
  surface-container-low: "#1B1D24"
  surface-container: "#202329"
  surface-container-high: "#262A31"
  surface-container-highest: "#2D323A"

  outline: "#4A4F5A"
  outline-variant: "#343841"
  focus-ring: "#F5DEA6"

  board-ground: "#1B1D24"
  board-grid: "#8B8FA359"
  board-selection: "#D9A648"
  board-hover: "#F5DEA6"

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
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-sm}"
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
  board:
    backgroundColor: "{colors.board-ground}"
  notice-error:
    backgroundColor: "{colors.error-container}"
    textColor: "{colors.on-error-container}"
    typography: "{typography.body-sm}"
    padding: "{spacing.md}"
---

## Overview

Tablewright is a virtual tabletop and worldbuilding suite. Its chrome is
recessive on purpose: the map art and the tokens on it are the picture,
and the interface is the frame. The same frame has to host any genre, so
nothing in it says "fantasy" or "sci-fi"; it says "quiet, dark, precise".

Three qualities govern every decision:

- **Recessive.** Surfaces are close in tone, outlines are hairlines, and
  the one accent is used sparingly for selection and the single most
  important action on screen.
- **Instant.** Panels are pre-mounted and open in the same frame. There
  are no spinners between local interactions and no animation that
  gates content.
- **Dark first.** The board is lit by the map, so the interface around
  it stays dark. A light theme is a separate palette, never an
  inversion.

The system is implemented as Lit web components with hand-written CSS
in `packages/ui`, and the board reads the same tokens into PixiJS
through a bridge in `packages/board`. Tokens are generated from the
front matter above into `packages/ui/src/tokens.css` as `--tw-*`
custom properties by `tools/build-tokens.ts`; that file is never edited
by hand.

## Colors

The neutral ramp does the work. `background` is the window ground, the
`surface-container-*` steps build panels and cards by tone rather than
by shadow, and `outline` and `outline-variant` draw hairline borders.
Text is warm grey, not white, so long sessions stay comfortable.

- **primary**, brass `#D9A648`, is selection and emphasis: the selected
  token's ring, the one primary button in a panel, the active tool.
- **secondary**, cool steel blue, carries information and secondary
  affordances such as links, measurement readouts, and inactive tools.
- **error** is reserved for failure states and destructive actions.
- **board-ground** sits one tonal step above `background` so an empty
  board reads as a board. **board-grid** carries its own alpha in
  eight-digit hex; the board bridge splits colour and opacity. The
  grid must never compete with map art.
- **board-selection** and **board-hover** are the token ring colours,
  brass and its pale container, read by the board bridge.

Colour never carries meaning alone. Every status colour is paired with
an icon, a label, or a position.

## Typography

One system sans-serif for everything textual, so the interface never
argues with a map's own lettering, and a tabular monospace for numbers
that change, such as distances, hit points, and latency readouts, so
digits do not jitter.

- `headline-md` and `headline-sm` name panels and sections.
- `body-md` is the default reading size; `body-sm` is for dense lists.
- `label-md` is buttons, tabs, and field labels, slightly tracked.
- `numeric-md` is any live number.

Two weights only, regular and semibold. No italics for emphasis; use
colour from the semantic set or weight.

## Layout

An 8 px rhythm with a 4 px half step. Panels are 320 px wide, dock to
the window edges, and float over the board without dimming it. The
board itself is full-window and everything else is layered above it.

- `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32.
- Panel padding is `lg`; controls inside a panel sit on `sm` gaps.
- `panel-width` is the one fixed dimension; content wraps, panels do
  not grow.

## Elevation & Depth

Depth is tonal. A panel is a lighter container on a darker ground with
a hairline `outline-variant` border; nothing casts a drop shadow over
the map. The board is the lowest layer, panels float above it, and
transient surfaces such as menus use `surface-container-highest`.

## Shapes

Small radii: `sm` for controls, `md` for panels, `lg` for transient
surfaces. Tokens on the board are circles by default, so `full` exists
for rings and pills. Never mix sharp and rounded corners in one view.

## Components

- **panel**: the container for sheets, search, and tools. Container
  tone, hairline border, `md` corners, `lg` padding, `headline-sm`
  title.
- **button-primary**: brass on dark text, `label-md`, one per panel at
  most. The hover state uses the pale container tone.
- **button-quiet**: the default button, a tonal step up from the panel
  with no border.
- **input**: the lowest container tone so the field reads as a well,
  with `focus-ring` on focus.
- **board**: the canvas; its ground and grid come from the board tokens
  through the bridge, not from CSS.
- **notice-error**: an inline error strip that says what went wrong,
  what was expected, and what to do; never a modal.

## Do's and Don'ts

- Do keep the chrome recessive: if a control competes with the map, it
  is too loud.
- Do reference semantic tokens in components (`{colors.primary}`),
  never raw hex, so a re-theme is one edit.
- Do drive visual state with attributes and custom properties; never
  write inline styles for state.
- Do pair colour with shape, icon, or label for every status.
- Do keep numbers in `numeric-md` so they stay still while they change.
- Don't show a spinner for a local read; show the content, or a named
  degraded state.
- Don't use drop shadows over the map; use tone and hairlines.
- Don't invert the dark palette to make a light one.
- Don't put more than one primary button in a panel.
- Don't let the grid or any overlay outshine the map art.
