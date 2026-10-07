/**
 * ─ Side view styles ─
 *
 * The strip's looks: the panel docked along the board's foot, its head,
 * the plot's box and the lines beside it, and every mark the plot draws,
 * each in the board's own colours so the slice reads as the board does.
 * Design: docs/templates.md "The side view".
 */

import { css, type CSSResult } from "lit";
import { PANEL_CHROME } from "../../atoms/styles.js";

/** The strip, whole. */
export const SIDE_VIEW_STYLES: CSSResult = css`
  :host {
    position: fixed;
    right: var(--tw-space-md);
    bottom: var(--tw-space-md);
    left: var(--tw-space-md);
    /* Under the rail, so a palette tall enough to reach it stays on top. */
    z-index: 110;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 11fr) minmax(0, 9fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--tw-space-xs) var(--tw-space-lg);
    height: 200px;
    padding: var(--tw-space-sm) var(--tw-space-md) var(--tw-space-md);
    ${PANEL_CHROME}
    color: var(--tw-comp-panel-text-color);
  }
  :host([hidden]) {
    display: none;
  }
  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: var(--tw-space-sm);
  }
  .cap {
    color: var(--tw-comp-panel-title-text-color);
    font: var(--tw-comp-panel-title-font);
    letter-spacing: var(--tw-typo-label-md-letter-spacing);
    text-transform: uppercase;
  }
  .label {
    color: var(--tw-on-surface-variant);
    font: var(--tw-typo-body-sm-font);
  }
  .plot {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--tw-rounded-sm);
    background: var(--tw-surface-container-lowest);
  }
  .plot > svg {
    position: absolute;
    inset: 0;
    display: block;
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: var(--tw-space-sm);
    margin: 0;
    padding: var(--tw-space-xs) 0 0;
    overflow-y: auto;
    list-style: none;
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--tw-space-sm);
    font: var(--tw-typo-body-md-font);
  }
  .line svg {
    flex: none;
  }
  .line[data-verdict="caught"] .words {
    color: var(--tw-primary);
  }
  .area {
    fill: var(--tw-board-ruler);
    fill-opacity: 0.22;
    stroke: var(--tw-board-ruler);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
  .ground {
    fill: var(--tw-surface-container-highest);
  }
  .ground-line {
    fill: none;
    stroke: var(--tw-board-ruler);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
  .lands {
    fill: none;
    stroke: var(--tw-primary);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .wall,
  .door {
    stroke-width: 3;
  }
  .wall {
    stroke: var(--tw-board-wall);
  }
  .door {
    stroke: var(--tw-board-threshold);
  }
  .mark {
    stroke: var(--tw-on-surface-variant);
    stroke-width: 1;
  }
  .mark-label,
  .tilt-label {
    font-family: var(--tw-typo-numeric-md-font-family);
    font-variant-numeric: tabular-nums;
  }
  .mark-label {
    fill: var(--tw-on-surface-variant);
    font-size: 9.5px;
    text-anchor: middle;
  }
  .origin {
    fill: var(--tw-primary);
  }
  .level {
    stroke: var(--tw-on-surface-variant);
    stroke-dasharray: 3 3;
  }
  .tilt {
    fill: none;
    stroke: var(--tw-primary);
    stroke-width: 1.6;
  }
  .tilt-label {
    fill: var(--tw-primary);
    font-size: 11px;
    font-weight: 600;
  }
  .cube {
    fill: var(--tw-board-token);
    fill-opacity: 0.35;
    stroke: var(--tw-board-token);
    stroke-width: 1.4;
  }
  .ring {
    fill: none;
    stroke: var(--tw-primary);
    stroke-width: 1.6;
    stroke-dasharray: 4 3;
  }
  .disc {
    fill: var(--tw-board-token);
    stroke: var(--tw-board-token-label);
    stroke-width: 1.4;
  }
  .disc-label {
    fill: var(--tw-board-token-label);
    font-family: var(--tw-typo-label-md-font-family);
    font-size: 10px;
    font-weight: 700;
    text-anchor: middle;
  }
  .sight {
    stroke: var(--tw-board-ruler);
    stroke-opacity: 0.5;
    stroke-width: 1.2;
    stroke-dasharray: 5 4;
  }
  .stop {
    fill: var(--tw-board-ruler);
  }
`;
