// The card everyone at the table sees when an entry is shared (design.md
// §6): paper on the desk, who shared it, the entry's summary, and a way
// to dismiss it. The host decides who "shared by" is and what a Reveal
// control does; this element only shows and dismisses.
//
// Events: `tw-dismiss` (detail: the hit) before the card removes itself.

import { LitElement, css, html, nothing } from "lit";
import { previewOf } from "../spotlight/preview.js";
import type { SpotlightHit } from "../spotlight/searcher.js";

export class TwShareCard extends LitElement {
  static override properties = {
    hit: { attribute: false },
    sharedBy: { type: String, attribute: "shared-by" },
  };

  declare hit: SpotlightHit | undefined;
  declare sharedBy: string;

  constructor() {
    super();
    this.hit = undefined;
    this.sharedBy = "";
  }

  static override styles = css`
    :host {
      display: block;
      background: var(--tw-comp-document-background-color);
      color: var(--tw-comp-document-text-color);
      font-family: var(--tw-comp-document-font-family);
      font-size: var(--tw-comp-document-font-size);
      line-height: var(--tw-comp-document-line-height);
      border-radius: var(--tw-comp-document-rounded);
      box-shadow: 0 10px 28px rgb(0 0 0 / 0.45);
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
    button:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 2px;
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-xs);
      padding: var(--tw-space-md) var(--tw-space-lg) var(--tw-space-lg);
    }
    .label {
      color: var(--tw-comp-document-label-text-color);
      font-family: var(--tw-comp-document-label-font-family);
      font-size: var(--tw-comp-document-label-font-size);
      font-weight: var(--tw-comp-document-label-font-weight);
      line-height: var(--tw-comp-document-label-line-height);
      letter-spacing: var(--tw-typo-document-label-letter-spacing);
      text-transform: uppercase;
    }
    .title {
      color: var(--tw-comp-document-title-text-color);
      font-family: var(--tw-comp-document-title-font-family);
      font-size: var(--tw-comp-document-title-font-size);
      font-weight: var(--tw-comp-document-title-font-weight);
      line-height: var(--tw-comp-document-title-line-height);
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
      .join(" · ");
    return html`
      <header>
        <span>Shared by <strong>${this.sharedBy}</strong></span>
        <button type="button" @click=${this.#dismiss}>
          Dismiss
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M4 4l8 8M12 4l-8 8"></path>
          </svg>
        </button>
      </header>
      <div class="body">
        <span class="label">${label}</span>
        <span class="title">${hit.name}</span>
        <span class="meta">${preview.meta}</span>
      </div>
    `;
  }

  #dismiss = (): void => {
    if (this.hit !== undefined) {
      this.dispatchEvent(
        new CustomEvent<SpotlightHit>("tw-dismiss", {
          detail: this.hit,
          bubbles: true,
          composed: true,
        })
      );
    }
    this.remove();
  };
}

customElements.define("tw-share-card", TwShareCard);

declare global {
  interface HTMLElementTagNameMap {
    "tw-share-card": TwShareCard;
  }
}
