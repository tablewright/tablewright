/**
 * ─ Readout ─
 *
 * What is under the pointer, in words, in the corner below the rail. The
 * shell writes the text; while it is empty nothing shows.
 */

import { LitElement, css, html, nothing } from "lit";

export class TwReadout extends LitElement {
  static override properties = {
    text: { type: String },
  };

  /** What is under the pointer, in words. */
  declare text: string;

  constructor() {
    super();
    this.text = "";
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
    return this.text === "" ? nothing : html`<div class="readout">${this.text}</div>`;
  }
}

customElements.define("tw-readout", TwReadout);

declare global {
  interface HTMLElementTagNameMap {
    "tw-readout": TwReadout;
  }
}
