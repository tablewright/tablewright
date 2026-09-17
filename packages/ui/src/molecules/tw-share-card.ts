/**
 * ─ Share card ─
 *
 * The card everyone at the table sees when an entry is shared: paper on
 * the desk, who shared it, the entry's summary, and a way to dismiss it.
 * Pressing the card opens the entry; the host decides who "shared by" is
 * and what a Reveal control does.
 * Design: docs/design.md §6
 */

import { LitElement, css, html, nothing } from "lit";
import { previewOf } from "../utils/preview.js";
import type { SpotlightHit } from "../utils/searcher.js";
import { emit } from "../utils/events.js";
import { CLOSE_ICON, ICON_STYLES } from "../atoms/icons.js";

export class TwShareCard extends LitElement {
  static override properties = {
    hit: { attribute: false },
    sharedBy: { type: String, attribute: "shared-by" },
    pending: { type: Number },
  };

  declare hit: SpotlightHit | undefined;
  declare sharedBy: string;
  /** How many more shares wait behind this one. */
  declare pending: number;

  constructor() {
    super();
    this.hit = undefined;
    this.sharedBy = "";
    this.pending = 0;
  }

  static override styles = css`
    ${ICON_STYLES}
    :host {
      display: block;
      background: var(--tw-comp-document-background-color);
      color: var(--tw-comp-document-text-color);
      font-family: var(--tw-comp-document-font-family);
      font-size: var(--tw-comp-document-font-size);
      line-height: var(--tw-comp-document-line-height);
      border-radius: var(--tw-comp-document-rounded);
      box-shadow: 0 10px 28px var(--tw-shadow-paper);
      overflow: hidden;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--tw-space-md);
      padding: var(--tw-space-sm) var(--tw-space-lg);
      background: var(--tw-paper-deep);
      border-bottom: 1px solid var(--tw-paper-shade);
      color: var(--tw-ink-soft);
      font-size: var(--tw-typo-body-sm-font-size);
      line-height: var(--tw-typo-body-sm-line-height);
    }
    button {
      --glyph-size: 14px;
      display: inline-flex;
      align-items: center;
      gap: var(--tw-space-xs);
      padding: 2px var(--tw-space-xs);
      border: 0;
      background: none;
      color: var(--tw-ink-soft);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      cursor: pointer;
    }
    button:focus-visible,
    .body:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: -2px;
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-xs);
      padding: var(--tw-space-md) var(--tw-space-lg) var(--tw-space-lg);
      cursor: pointer;
    }
    .body:hover {
      background: var(--tw-paper-deep);
    }
    .label {
      color: var(--tw-comp-document-label-text-color);
      font: var(--tw-comp-document-label-font);
      letter-spacing: var(--tw-typo-document-label-letter-spacing);
      text-transform: uppercase;
    }
    .title {
      color: var(--tw-comp-document-title-text-color);
      font: var(--tw-comp-document-title-font);
    }
    .meta {
      color: var(--tw-ink-soft);
      font-size: var(--tw-typo-body-sm-font-size);
      line-height: var(--tw-typo-body-sm-line-height);
    }
  `;

  protected override render() {
    const hit = this.hit;
    if (hit === undefined) {
      return nothing;
    }
    const preview = previewOf(hit);
    const label = [hit.type, preview.badge ?? preview.ring]
      .filter((part) => part !== undefined)
      .join(" — ");
    const waiting =
      this.pending > 0 ? ` — ${this.pending} more ${this.pending === 1 ? "waits" : "wait"}` : "";
    return html`
      <header>
        <span>Shared by <strong>${this.sharedBy}</strong>${waiting}</span>
        <button type="button" @click=${this.#dismiss}>Dismiss ${CLOSE_ICON}</button>
      </header>
      <div
        class="body"
        role="button"
        tabindex="0"
        aria-label=${`Open ${hit.name}`}
        @click=${this.#open}
        @keydown=${this.#onKeydown}
      >
        <span class="label">${label}</span>
        <span class="title">${hit.name}</span>
        <span class="meta">${preview.meta}</span>
      </div>
    `;
  }

  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.#open();
    }
  };

  #open = (): void => {
    this.#tell("tw-open");
  };

  #dismiss = (): void => {
    this.#tell("tw-dismiss");
  };

  // Both carry the hit; the host opens it, or removes the card.
  #tell(name: "tw-open" | "tw-dismiss"): void {
    if (this.hit === undefined) {
      return;
    }
    emit(this, name, this.hit);
  }
}

customElements.define("tw-share-card", TwShareCard);

declare global {
  interface HTMLElementTagNameMap {
    "tw-share-card": TwShareCard;
  }
  interface HTMLElementEventMap {
    "tw-open": CustomEvent<SpotlightHit>;
    "tw-dismiss": CustomEvent<SpotlightHit>;
  }
}
