/**
 * ─ Board theme bridge ─
 *
 * The board draws with Pixi but is themed by CSS: the tokens generated
 * from DESIGN.md are read off an element's computed style and handed
 * to the layers as packed colours. Re-read whenever the document's
 * theme attributes or the colour-scheme preference change, so a
 * theme switch reaches the canvas in the same frame as the DOM.
 * Design: docs/design.md §5, token bridge.
 */

import { parseCssColor, type PackedColor } from "./css-color.js";

export interface BoardTheme {
  /** Canvas clear colour. */
  readonly ground: number;
  readonly grid: PackedColor;
  readonly selection: PackedColor;
  readonly hover: PackedColor;
  readonly token: PackedColor;
  readonly tokenLabel: PackedColor;
  /** What the DM drew over the map: walls, thresholds, what sight passes, tinted cells. */
  readonly wall: PackedColor;
  readonly threshold: PackedColor;
  readonly sight: PackedColor;
  readonly difficult: PackedColor;
  readonly air: PackedColor;
  /** Ground drawn as texture: a painted floor where the picture has none. */
  readonly floor: PackedColor;
  /** How height shows: the low-side shadow, the contour hairline, the washes, the tag text. */
  readonly heightShade: PackedColor;
  readonly heightLine: PackedColor;
  readonly heightUp: PackedColor;
  readonly heightDown: PackedColor;
  readonly heightTag: PackedColor;
  /** The ruler: its line, its ends and its numbers. */
  readonly ruler: PackedColor;
  /** The one red on the board: a way past what this turn's movement reaches. */
  readonly beyond: PackedColor;
  /**
   * The faces the board sets text in, as CSS font stacks. Figures for
   * anything measured — a badge, a height tag, the numbers view — and
   * labels for what a thing standing on the board is called.
   */
  readonly figures: string;
  readonly labels: string;
  /**
   * The face a mark is drawn from. It goes after the text faces rather than
   * before them: the icon file keeps the letters of the names its ligatures
   * spell, so asked first it would answer for the a in "Dash" as well.
   */
  readonly marks: string;
}

// Used when a token is missing or unparseable, so a broken theme still shows a board.
const FALLBACK: BoardTheme = {
  ground: 0x1b1d24,
  grid: { rgb: 0x8b8fa3, alpha: 0.35 },
  selection: { rgb: 0xc9a24e, alpha: 1 },
  hover: { rgb: 0xe4c57a, alpha: 1 },
  token: { rgb: 0xb5683e, alpha: 1 },
  tokenLabel: { rgb: 0xf1e6d2, alpha: 1 },
  wall: { rgb: 0xf1e6d2, alpha: 0.4 },
  threshold: { rgb: 0xc9a24e, alpha: 1 },
  sight: { rgb: 0x5fa8bd, alpha: 1 },
  difficult: { rgb: 0xf1e6d2, alpha: 0.12 },
  air: { rgb: 0x5fa8bd, alpha: 0.28 },
  floor: { rgb: 0xf1e6d2, alpha: 0.08 },
  heightShade: { rgb: 0x000000, alpha: 1 },
  heightLine: { rgb: 0xf1e6d2, alpha: 0.6 },
  heightUp: { rgb: 0xe4c57a, alpha: 1 },
  heightDown: { rgb: 0x5fa8bd, alpha: 1 },
  heightTag: { rgb: 0xf1e6d2, alpha: 1 },
  ruler: { rgb: 0xf1e6d2, alpha: 1 },
  beyond: { rgb: 0xc8553d, alpha: 1 },
  figures: "ui-monospace, monospace",
  labels: "system-ui, sans-serif",
  marks: "sans-serif",
};

/** Read the board tokens from `element`'s computed style. */
export function readBoardTheme(element: Element): BoardTheme {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: PackedColor): PackedColor =>
    parseCssColor(style.getPropertyValue(`--tw-board-${name}`)) ?? fallback;
  const face = (name: string, fallback: string): string =>
    style.getPropertyValue(`--tw-typo-${name}-font-family`).trim() || fallback;
  return {
    ground: token("ground", { rgb: FALLBACK.ground, alpha: 1 }).rgb,
    grid: token("grid", FALLBACK.grid),
    selection: token("selection", FALLBACK.selection),
    hover: token("hover", FALLBACK.hover),
    token: token("token", FALLBACK.token),
    tokenLabel: token("token-label", FALLBACK.tokenLabel),
    wall: token("wall", FALLBACK.wall),
    threshold: token("threshold", FALLBACK.threshold),
    sight: token("sight", FALLBACK.sight),
    difficult: token("difficult", FALLBACK.difficult),
    air: token("air", FALLBACK.air),
    floor: token("floor", FALLBACK.floor),
    heightShade: token("height-shade", FALLBACK.heightShade),
    heightLine: token("height-line", FALLBACK.heightLine),
    heightUp: token("height-up", FALLBACK.heightUp),
    heightDown: token("height-down", FALLBACK.heightDown),
    heightTag: token("height-tag", FALLBACK.heightTag),
    ruler: token("ruler", FALLBACK.ruler),
    beyond: token("beyond", FALLBACK.beyond),
    figures: face("numeric-md", FALLBACK.figures),
    labels: face("label-md", FALLBACK.labels),
    marks: face("icon-md", FALLBACK.marks),
  };
}

/**
 * Ask the browser for the faces the board draws in, and wait until it has
 * them.
 *
 * `document.fonts.ready` is not enough on its own. It settles the loads the
 * document has asked for, and a face is only asked for when an element is
 * set in it — Pixi draws to a canvas, which asks for nothing. A face no
 * element happened to use would still be missing at the first frame, Pixi
 * would measure the fallback, and every badge would keep the fallback's
 * widths for the rest of the session.
 *
 * The weights are the ones the board actually sets: a broken face is not
 * worth refusing to draw over, so a load that fails is let through.
 */
export async function loadBoardFaces(theme: BoardTheme): Promise<void> {
  const wanted = [
    `600 16px ${theme.figures}`,
    `700 16px ${theme.labels}`,
    `500 16px ${theme.marks}`,
  ];
  await Promise.all(wanted.map((font) => document.fonts.load(font).catch(() => [])));
  await document.fonts.ready;
}

/** Call `onChange` with a fresh theme whenever it may have changed; returns the stop function. */
export function watchBoardTheme(
  element: Element,
  onChange: (theme: BoardTheme) => void
): () => void {
  const notify = (): void => onChange(readBoardTheme(element));
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class", "style"],
  });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", notify);
  return () => {
    observer.disconnect();
    scheme.removeEventListener("change", notify);
  };
}
