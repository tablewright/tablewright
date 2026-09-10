// A strip of cells under a label: the search tray's rail and switch
// control, shared so the palette's option groups read the same. The host
// says which cells are on; a click reports the cell and nothing more, so
// a strip can be a radio, a set of switches, or the tray's three-way cells.
//
// `tw-cell` carries the value clicked.

import { LitElement, css, html } from "lit";
import { titleCase } from "../text.js";

export class TwStrip extends LitElement {
  static override properties = {
    label: { type: String },
    values: { attribute: false },
    pressed: { attribute: false },
    labels: { attribute: false },
  };

  /** What the strip is, for assistive tech. */
  declare label: string;
  /** The values on offer, in order. */
  declare values: readonly string[];
  /** The values on. */
  declare pressed: readonly string[];
  /** What a value reads as, when not its own word. */
  declare labels: Readonly<Record<string, string>>;

  constructor() {
    super();
    this.label = "";
    this.values = [];
    this.pressed = [];
    this.labels = {};
  }

  static override styles = css`
    :host {
      display: flex;
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-lowest, var(--tw-surface));
      overflow: hidden;
    }
    .cell {
      flex: 1 1 0;
      min-width: 0;
      margin: 0;
      padding: 5px 0;
      border: 0;
      border-right: 1px solid var(--tw-outline-variant);
      background: none;
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-numeric-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      user-select: none;
    }
    .cell:last-child {
      border-right: 0;
    }
    .cell.wide {
      flex-grow: 1.6;
    }
    .cell:hover {
      background: var(--tw-surface-container-high);
      color: var(--tw-on-surface);
    }
    .cell[aria-pressed="true"] {
      background: var(--tw-primary);
      color: var(--tw-on-primary);
      font-weight: var(--tw-typo-label-md-font-weight);
    }
    .cell:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 1px;
    }
  `;

  override render() {
    return html`<div role="group" aria-label=${this.label} style="display: contents">
      ${this.values.map((value) => {
        const label = this.labels[value] ?? titleCase(value);
        return html`<button
          type="button"
          class="cell ${label.length > 8 ? "wide" : ""}"
          aria-pressed=${this.pressed.includes(value) ? "true" : "false"}
          @click=${() => this.#pick(value)}
        >
          ${label}
        </button>`;
      })}
    </div>`;
  }

  #pick(value: string): void {
    this.dispatchEvent(
      new CustomEvent("tw-cell", { detail: { value }, bubbles: true, composed: true })
    );
  }
}

customElements.define("tw-strip", TwStrip);

declare global {
  interface HTMLElementTagNameMap {
    "tw-strip": TwStrip;
  }
}
