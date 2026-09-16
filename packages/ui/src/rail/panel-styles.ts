/**
 * ─ Panel styles ─
 *
 * The looks the rail's panels share: the panel and its head, a captioned
 * section, the tiles, and a number or a slider in a field.
 */

import { css, type CSSResult } from "lit";
import { FOCUS_RING, PANEL_CHROME } from "../styles.js";

/** The count pill: a number in the rail's colour, on the rail's foot and the history's head. */
export const COUNT_PILL: CSSResult = css`
  .count {
    padding: 1px 6px;
    border-radius: var(--tw-rounded-full);
    background: var(--tw-primary);
    color: var(--tw-on-primary);
    font-size: 10px;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: 0;
  }
`;

/** A panel and everything in it, for each of the rail's panels to take in whole. */
export const PANEL_STYLES: CSSResult = css`
  /* No box of its own: the panel stands in the rail's side column as the
     rail lays it out. */
  :host {
    display: contents;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 236px;
    padding: 10px;
    pointer-events: auto;
    ${PANEL_CHROME}
    color: var(--tw-comp-panel-text-color);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--tw-space-sm);
  }
  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--tw-rounded-sm);
    background: var(--tw-primary);
    color: var(--tw-on-primary);
  }
  .title {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }
  .tag {
    align-self: flex-start;
    padding: 2px 6px;
    border: 1px solid var(--tw-outline-variant);
    border-radius: var(--tw-rounded-full);
    color: var(--tw-on-surface-variant);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .name {
    font-size: var(--tw-typo-body-md-font-size);
    letter-spacing: 0;
  }
  .hint {
    color: var(--tw-on-surface-variant);
    font-size: var(--tw-typo-body-sm-font-size);
    font-weight: var(--tw-typo-body-sm-font-weight);
    line-height: var(--tw-typo-body-sm-line-height);
    letter-spacing: 0;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--tw-space-xs);
  }
  .cap {
    color: var(--tw-comp-panel-title-text-color);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: var(--tw-space-xs);
  }
  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid var(--tw-outline-variant);
    border-radius: var(--tw-rounded-sm);
    background: var(--tw-surface-container-lowest);
    color: var(--tw-on-surface);
    cursor: pointer;
  }
  .tile:hover {
    background: var(--tw-surface-container-highest);
  }
  .tile[aria-pressed="true"] {
    border-color: var(--tw-primary-container);
    background: var(--tw-primary-container);
    color: var(--tw-on-primary-container);
  }
  .field {
    display: flex;
    align-items: center;
    gap: var(--tw-space-sm);
  }
  .number {
    width: 72px;
    padding: var(--tw-comp-input-padding);
    border: 1px solid var(--tw-outline);
    border-radius: var(--tw-comp-input-rounded);
    background: var(--tw-comp-input-background-color);
    color: var(--tw-comp-input-text-color);
    font: inherit;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
  }
  .range {
    flex: 1;
    min-width: 0;
    margin: 0;
    accent-color: var(--tw-primary);
  }
  .unit {
    min-width: 5.5ch;
    color: var(--tw-on-surface-variant);
    font-size: var(--tw-typo-body-sm-font-size);
    font-weight: var(--tw-typo-body-sm-font-weight);
    letter-spacing: 0;
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  ${FOCUS_RING}
`;
