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
}

// Used when a token is missing or unparseable, so a broken theme still shows a board.
const FALLBACK: BoardTheme = {
  ground: 0x1b1d24,
  grid: { rgb: 0x8b8fa3, alpha: 0.35 },
  selection: { rgb: 0xd9a648, alpha: 1 },
  hover: { rgb: 0xf5dea6, alpha: 1 },
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
