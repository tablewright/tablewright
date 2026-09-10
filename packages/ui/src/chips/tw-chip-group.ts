// A row of chips, one choice or several: the search tray's chips, shared
// so the palette's option groups read the same. The host says which are
// on; a click reports the chip and nothing more, so a group can be a
// radio, a set of toggles, or the tray's three-way cells.
//
// `tw-chip` carries the value clicked.

import { LitElement, css, html } from "lit";
import { titleCase } from "../text.js";

export class TwChipGroup extends LitElement {
  static override properties = {
    label: { type: String },
    values: { attribute: false },
    pressed: { attribute: false },
  };

  /** What the group is, for assistive tech. */
  declare label: string;
  /** The values on offer, in order. */
  declare values: readonly string[];
  /** The values on. */
  declare pressed: readonly string[];

  constructor() {
    super();
    this.label = "";
    this.values = [];
    this.pressed = [];
  }

  static override styles = css`
    :host {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      padding: 3px 10px;
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-high);
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      white-space: nowrap;
      cursor: pointer;
    }
    .chip[aria-pressed="true"] {
      border-color: var(--tw-primary);
      background: var(--tw-primary);
      color: var(--tw-on-primary);
    }
    .chip:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 2px;
    }
  `;

  override render() {
    return html`<div role="group" aria-label=${this.label} style="display: contents">
      ${this.values.map(
        (value) =>
          html`<button
            type="button"
            class="chip"
            aria-pressed=${this.pressed.includes(value) ? "true" : "false"}
            @click=${() => this.#pick(value)}
          >
            ${titleCase(value)}
          </button>`
      )}
    </div>`;
  }

  #pick(value: string): void {
    this.dispatchEvent(
      new CustomEvent("tw-chip", { detail: { value }, bubbles: true, composed: true })
    );
  }
}

customElements.define("tw-chip-group", TwChipGroup);

declare global {
  interface HTMLElementTagNameMap {
    "tw-chip-group": TwChipGroup;
  }
}
