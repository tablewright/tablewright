/**
 * ─ Stroke history ─
 *
 * The scene's strokes, newest first, opened from the rail's foot: what was
 * just drawn is what the DM wants back or gone. A reset is a stroke of its
 * own, so it stays in the list.
 */

import { LitElement, css, html, nothing } from "lit";
import type { Stroke } from "@tablewright/schema";
import { describeStroke } from "@tablewright/board";
import { emit } from "../utils/events.js";
import { QUIET_BUTTON, QUIET_BUTTON_HOVER } from "../atoms/styles.js";
import { COUNT_PILL, PANEL_STYLES } from "../atoms/panel-styles.js";

// How much of the history shows until all of it is asked for.
const RECENT = 3;

export class TwStrokeHistory extends LitElement {
  static override properties = {
    strokes: { attribute: false },
    showAll: { state: true },
  };

  /** The scene's strokes, in the order they were made. */
  declare strokes: Stroke[];
  declare showAll: boolean;

  constructor() {
    super();
    this.strokes = [];
    this.showAll = false;
  }

  static override styles = [
    PANEL_STYLES,
    COUNT_PILL,
    css`
      .history-head {
        display: flex;
        align-items: center;
        gap: var(--tw-space-sm);
      }
      .reset {
        margin-left: auto;
        ${QUIET_BUTTON}
        padding: var(--tw-space-xs) var(--tw-space-sm);
        font-size: 11px;
        letter-spacing: inherit;
      }
      .reset:hover {
        ${QUIET_BUTTON_HOVER}
      }
      ol {
        display: flex;
        flex-direction: column;
        gap: 1px;
        max-height: 40vh;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        list-style: none;
        font-size: var(--tw-typo-body-sm-font-size);
        font-weight: var(--tw-typo-body-sm-font-weight);
        line-height: var(--tw-typo-body-sm-line-height);
        letter-spacing: 0;
      }
      li {
        display: flex;
        align-items: center;
        gap: var(--tw-space-sm);
        padding: var(--tw-space-xs) 6px;
        border-radius: var(--tw-rounded-sm);
      }
      li:hover {
        background: var(--tw-surface-container-high);
      }
      .n {
        min-width: 2ch;
        color: var(--tw-on-surface-variant);
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
      .what {
        flex: 1;
      }
      .who {
        color: var(--tw-primary);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .x {
        margin-left: auto;
        width: 20px;
        height: 20px;
        padding: 0;
        border: 0;
        border-radius: var(--tw-rounded-sm);
        background: transparent;
        color: var(--tw-on-surface-variant);
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
      }
      .x:hover {
        background: var(--tw-surface-container-highest);
        color: var(--tw-on-surface);
      }
      .link {
        align-self: flex-start;
        padding: 2px 6px;
        border: 0;
        background: transparent;
        color: var(--tw-on-surface-variant);
        font-size: var(--tw-typo-body-sm-font-size);
        font-weight: var(--tw-typo-body-sm-font-weight);
        letter-spacing: 0;
        cursor: pointer;
      }
      .link:hover {
        color: var(--tw-on-surface);
      }
      .empty {
        padding: var(--tw-space-xs) 6px;
        color: var(--tw-on-surface-variant);
        font-size: var(--tw-typo-body-sm-font-size);
        font-weight: var(--tw-typo-body-sm-font-weight);
        letter-spacing: 0;
      }
    `,
  ];

  override render() {
    const total = this.strokes.length;
    const entries = this.strokes.map((stroke, index) => ({ stroke, index })).reverse();
    const shown = this.showAll ? entries : entries.slice(0, RECENT);
    return html`<div class="panel">
      <div class="history-head">
        <span class="cap">History</span>
        <span class="count">${total}</span>
        <button
          class="reset"
          type="button"
          title="Clear everything drawn; the reset stays in the history"
          @click=${this.#reset}
        >
          Reset
        </button>
      </div>
      ${
        total === 0
          ? html`<span class="empty">Nothing drawn yet.</span>`
          : html`<ol>
              ${shown.map(
                ({ stroke, index }) =>
                  html`<li>
                    <span class="n">${index + 1}</span>
                    <span class="what">${describeStroke(stroke)}</span>
                    ${stroke.visibility === "dm" ? html`<span class="who">DM only</span>` : nothing}
                    <button
                      class="x"
                      type="button"
                      aria-label="Remove stroke ${index + 1}"
                      title="Remove this stroke"
                      @click=${() => this.#remove(index)}
                    >
                      ×
                    </button>
                  </li>`
              )}
            </ol>`
      }
      ${
        total > RECENT
          ? html`<button
              class="link"
              type="button"
              @click=${() => {
                this.showAll = !this.showAll;
              }}
            >
              ${this.showAll ? `Show the last ${RECENT}` : `Show all ${total}`}
            </button>`
          : nothing
      }
    </div>`;
  }

  // A reset is a stroke of its own, so it stays in the history.
  #reset = (): void => {
    emit(this, "tw-reset");
  };

  #remove(index: number): void {
    emit(this, "tw-remove", { index });
  }
}

customElements.define("tw-stroke-history", TwStrokeHistory);

declare global {
  interface HTMLElementTagNameMap {
    "tw-stroke-history": TwStrokeHistory;
  }
  interface HTMLElementEventMap {
    "tw-reset": CustomEvent<null>;
    "tw-remove": CustomEvent<{ index: number }>;
  }
}
