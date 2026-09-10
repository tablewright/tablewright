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
  /** How height shows: the low-side shadow, the contour hairline, the washes, the tag text. */
  readonly heightShade: PackedColor;
  readonly heightLine: PackedColor;
  readonly heightUp: PackedColor;
  readonly heightDown: PackedColor;
  readonly heightTag: PackedColor;
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
  heightShade: { rgb: 0x000000, alpha: 1 },
  heightLine: { rgb: 0xf1e6d2, alpha: 0.6 },
  heightUp: { rgb: 0xe4c57a, alpha: 1 },
  heightDown: { rgb: 0x5fa8bd, alpha: 1 },
  heightTag: { rgb: 0xf1e6d2, alpha: 1 },
};

/** Read the board tokens from `element`'s computed style. */
export function readBoardTheme(element: Element): BoardTheme {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: PackedColor): PackedColor =>
    parseCssColor(style.getPropertyValue(`--tw-board-${name}`)) ?? fallback;
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
    heightShade: token("height-shade", FALLBACK.heightShade),
    heightLine: token("height-line", FALLBACK.heightLine),
    heightUp: token("height-up", FALLBACK.heightUp),
    heightDown: token("height-down", FALLBACK.heightDown),
    heightTag: token("height-tag", FALLBACK.heightTag),
  };
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
