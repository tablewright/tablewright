/**
 * ─ Spotlight styles ─
 *
 * The box's looks: the scrim, the bar and the mask over it, the tabs, the
 * groups and their options in a grid, and the footer. What is inside an
 * option is the tile's own.
 * Design: docs/design.md §3
 */

import { css, type CSSResult } from "lit";
import { ICON_STYLES } from "../../atoms/icons.js";
import { FOCUS_OUTLINE, QUIET_BUTTON } from "../../atoms/styles.js";

/** The box, whole. */
export const SPOTLIGHT_STYLES: CSSResult = css`
  ${ICON_STYLES}
  :host {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: block;
  }
  :host(:not([open])) {
    display: none;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: var(--tw-scrim);
  }
  .box {
    position: absolute;
    top: var(--tw-space-lg);
    bottom: var(--tw-space-lg);
    left: var(--tw-space-lg);
    width: min(440px, calc(100vw - 2 * var(--tw-space-lg)));
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: var(--tw-comp-panel-background-color);
    color: var(--tw-comp-panel-text-color);
    font-family: var(--tw-comp-panel-font-family);
    font-size: var(--tw-comp-panel-font-size);
    line-height: var(--tw-comp-panel-line-height);
    border: 1px solid var(--tw-outline-variant);
    border-radius: var(--tw-comp-panel-rounded);
    overflow: hidden;
  }
  .field {
    position: relative;
  }
  /* The words stay the words: the input's own text is painted transparent
     and the mask over it draws the same text with what the parser
     understood underlined, and what the tray overruled greyed. */
  input,
  .mask {
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: var(--tw-space-md) var(--tw-space-lg);
    border: 0;
    border-bottom: 1px solid var(--tw-outline-variant);
    font-family: var(--tw-comp-input-font-family);
    font-size: var(--tw-typo-headline-sm-font-size);
    font-weight: var(--tw-comp-input-font-weight);
    line-height: var(--tw-typo-headline-sm-line-height);
  }
  input {
    outline: none;
    background: var(--tw-comp-input-background-color);
    color: transparent;
    caret-color: var(--tw-comp-input-text-color);
  }
  input::placeholder {
    color: var(--tw-on-surface-variant);
  }
  .mask {
    position: absolute;
    inset: 0;
    border-bottom-color: transparent;
    overflow: hidden;
    white-space: pre;
    pointer-events: none;
    color: var(--tw-comp-input-text-color);
  }
  .mask u {
    text-decoration: underline;
    text-decoration-color: var(--tw-primary);
    text-decoration-thickness: 1.5px;
    text-underline-offset: 4px;
  }
  .mask .masked {
    color: var(--tw-on-surface-variant);
    opacity: 0.6;
  }
  .funnel {
    --glyph-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: var(--tw-space-xs);
    margin-left: auto;
  }
  .funnel[aria-pressed="true"] {
    border: 1px solid var(--tw-primary);
  }
  /* Screen order: input, tabs, results, footer. DOM order puts the tabs after
     the results so the tab key reaches the selected tile before them. */
  .tabs {
    order: 1;
    display: flex;
    flex-wrap: wrap;
    gap: var(--tw-space-sm);
    padding: var(--tw-space-sm) var(--tw-space-lg) var(--tw-space-xs);
  }
  .tabs:empty {
    display: none;
  }
  .tab {
    ${QUIET_BUTTON}
    padding: var(--tw-space-xs) 10px;
    border: 0;
    background: var(--tw-surface-container-high);
    color: var(--tw-on-surface-variant);
  }
  .tab[aria-pressed="true"] {
    background: var(--tw-primary-container);
    color: var(--tw-on-primary-container);
  }
  .results {
    order: 2;
    flex: 1 1 auto;
    overflow-y: auto;
    padding-bottom: var(--tw-space-sm);
  }
  /* Empty, the box is just the search bar and its hint; it grows to the
     full panel once there is anything to show. */
  .box.idle {
    bottom: auto;
  }
  .box.idle .results {
    display: none;
  }
  li:focus-visible {
    ${FOCUS_OUTLINE}
    outline-offset: -2px;
  }
  .group {
    display: flex;
    justify-content: space-between;
    padding: var(--tw-space-md) var(--tw-space-lg) var(--tw-space-xs);
    color: var(--tw-on-surface-variant);
    font: var(--tw-typo-label-md-font);
    letter-spacing: var(--tw-typo-label-md-letter-spacing);
    text-transform: uppercase;
  }
  .group .hint {
    text-transform: none;
    letter-spacing: 0;
    font-weight: var(--tw-typo-body-sm-font-weight);
  }
  ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--tw-space-sm);
    margin: 0;
    padding: var(--tw-space-xs) var(--tw-space-lg) var(--tw-space-sm);
    list-style: none;
  }
  /* The option is the frame: its border, its surface and its selected
     colour. The tile inside draws the rest and takes the padding, so a
     pointer anywhere inside the frame is on the tile. */
  li {
    display: block;
    border: 1px solid var(--tw-outline-variant);
    border-radius: var(--tw-rounded-sm);
    background: var(--tw-surface-container-high);
    cursor: pointer;
  }
  li[aria-selected="true"] {
    background: var(--tw-primary-container);
    border-color: var(--tw-primary);
    color: var(--tw-on-primary-container);
  }
  footer {
    order: 3;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px var(--tw-space-md);
    padding: var(--tw-space-xs) var(--tw-space-lg);
    border-top: 1px solid var(--tw-outline-variant);
    color: var(--tw-on-surface-variant);
    font-family: var(--tw-typo-numeric-md-font-family);
    font-size: var(--tw-typo-body-sm-font-size);
    line-height: var(--tw-typo-body-sm-line-height);
    font-variant-numeric: tabular-nums;
  }
  footer[data-status="error"] {
    color: var(--tw-error);
  }
`;
