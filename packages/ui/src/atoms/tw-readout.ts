/**
 * ─ Readout ─
 *
 * What is under the pointer, in words, in the corner below the rail. The
 * shell hands it what the topology says of the cell; over no cell nothing
 * shows.
 */

import { LitElement, css, html, nothing } from "lit";
import { DEFAULT_RULE, signed, type CellReadout } from "@tablewright/board";

export class TwReadout extends LitElement {
  static override properties = {
    readout: { attribute: false },
    unit: { type: String },
  };

  /** What the topology says about the cell under the pointer, or nothing over none. */
  declare readout: CellReadout | undefined;
  /** The rule's unit, which the height is read in. */
  declare unit: string;

  constructor() {
    super();
    this.readout = undefined;
    this.unit = DEFAULT_RULE.unit;
  }

  static override styles = css`
    :host {
      display: contents;
    }
    :host([hidden]) {
      display: none;
    }
    .readout {
      position: fixed;
      left: var(--tw-space-md);
      bottom: var(--tw-space-md);
      padding: 6px 10px;
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-comp-panel-background-color);
      color: var(--tw-on-surface-variant);
      font-size: var(--tw-typo-body-sm-font-size);
      font-weight: var(--tw-typo-body-sm-font-weight);
      line-height: var(--tw-typo-body-sm-line-height);
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
    }
  `;

  override render() {
    const { readout } = this;
    return readout === undefined
      ? nothing
      : html`<div class="readout">${this.#words(readout)}</div>`;
  }

  // The ground state, the height the rules give the cell, and whether a level
  // change was painted there.
  #words(readout: CellReadout): string {
    if (readout.ground === "void") {
      return "Void: outside the scene";
    }
    const height =
      readout.height === 0 ? "ground level" : `${signed(Math.round(readout.height))} ${this.unit}`;
    return `${readout.ground}, ${height}${readout.isLevelChange ? ", level change" : ""}`;
  }
}

customElements.define("tw-readout", TwReadout);

declare global {
  interface HTMLElementTagNameMap {
    "tw-readout": TwReadout;
  }
}
