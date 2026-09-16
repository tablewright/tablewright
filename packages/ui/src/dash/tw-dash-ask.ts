// The one question a move asks: a bar under the board saying what the way
// costs against the movement left, with the two answers. It stands while a
// token waits at the destination for the answer, and goes as soon as one
// comes.
//
// `tw-dash` carries whether the dash was used.

import { LitElement, css, html } from "lit";
import { emit } from "../events.js";
import { FOCUS_RING, QUIET_BUTTON } from "../styles.js";

export class TwDashAsk extends LitElement {
  static override properties = {
    cost: { type: Number },
    left: { type: Number },
    unit: { type: String },
  };

  /** What the way costs, in `unit`. */
  declare cost: number;
  /** Movement left this turn before the dash, in `unit`. */
  declare left: number;
  /** The rule's unit, as the numbers are shown. */
  declare unit: string;

  constructor() {
    super();
    this.cost = 0;
    this.left = 0;
    this.unit = "ft";
  }

  static override styles = css`
    :host {
      position: fixed;
      left: 50%;
      bottom: var(--tw-space-lg);
      transform: translateX(-50%);
      z-index: 140;
      display: flex;
      align-items: center;
      gap: var(--tw-space-md);
      padding: var(--tw-space-sm) var(--tw-space-md);
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-comp-panel-background-color, var(--tw-surface));
      color: var(--tw-on-surface);
      font: var(--tw-typo-label-md-font);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      white-space: nowrap;
    }
    :host([hidden]) {
      display: none;
    }
    .cost {
      font-variant-numeric: tabular-nums;
    }
    button {
      margin: 0;
      ${QUIET_BUTTON}
      padding: 4px 10px;
      border-color: var(--tw-outline-variant);
      background: none;
      color: var(--tw-on-surface-variant);
    }
    button:hover {
      background: var(--tw-surface-container-high);
      color: var(--tw-on-surface);
    }
    button.use {
      border-color: var(--tw-primary);
      background: var(--tw-primary);
      color: var(--tw-on-primary);
    }
    ${FOCUS_RING}
  `;

  override render() {
    return html`<span class="cost"
        >${this.cost} ${this.unit}: ${this.left} ${this.unit} of movement left. Dash?</span
      >
      <button type="button" class="use" @click=${() => this.#answer(true)}>Use dash</button>
      <button type="button" @click=${() => this.#answer(false)}>Cancel</button>`;
  }

  #answer(use: boolean): void {
    emit(this, "tw-dash", { use });
  }
}

customElements.define("tw-dash-ask", TwDashAsk);

declare global {
  interface HTMLElementTagNameMap {
    "tw-dash-ask": TwDashAsk;
  }
  interface HTMLElementEventMap {
    "tw-dash": CustomEvent<{ use: boolean }>;
  }
}
