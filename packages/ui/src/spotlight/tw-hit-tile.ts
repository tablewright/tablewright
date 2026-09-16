/**
 * ─ Hit tile ─
 *
 * One hit as a tile: the name, its line, a ring or a badge at its foot,
 * the version it stands in for, and a Share button. The box draws the
 * option around it, since its input names the selected option by id and
 * an ARIA id does not reach into a shadow root; the tile draws what is in
 * the option and takes its padding, so a pointer anywhere inside the
 * frame is on the tile.
 * Design: docs/design.md §3
 */

import { LitElement, css, html, nothing } from "lit";
import { previewOf } from "./preview.js";
import type { Taxonomy } from "./preview.js";
import type { SpotlightHit } from "./searcher.js";
import { emit } from "../events.js";
import { ICON_STYLES, SHARE_ICON } from "../icons.js";
import { QUIET_BUTTON } from "../styles.js";

export class TwHitTile extends LitElement {
  static override properties = {
    hit: { attribute: false },
    taxonomy: { attribute: false },
    version: { type: String },
    selected: { type: Boolean, reflect: true },
  };

  declare hit: SpotlightHit | undefined;
  /** Kind to category label, for the preview. */
  declare taxonomy: Taxonomy | undefined;
  /** The rule version the viewer reads; a hit of another is a stand-in and says so. */
  declare version: string;
  /** Drawn as the selected option; the box says which. */
  declare selected: boolean;

  constructor() {
    super();
    this.hit = undefined;
    this.taxonomy = undefined;
    this.version = "";
    this.selected = false;
  }

  static override styles = css`
    ${ICON_STYLES}
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-xs);
      padding: 10px var(--tw-space-md);
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta {
      color: var(--tw-on-surface-variant);
      font-size: var(--tw-typo-body-sm-font-size);
      line-height: var(--tw-typo-body-sm-line-height);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    :host([selected]) .meta {
      color: inherit;
      opacity: 0.8;
    }
    .foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--tw-space-sm);
      min-height: 24px;
      margin-top: var(--tw-space-xs);
    }
    .badge {
      padding: 1px var(--tw-space-sm);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container);
      color: var(--tw-on-surface-variant);
      font: var(--tw-typo-label-md-font);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      white-space: nowrap;
    }
    :host([selected]) .badge {
      background: var(--tw-primary);
      color: var(--tw-on-primary);
    }
    .year {
      padding: 1px var(--tw-space-sm);
      border: 1px dashed var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      color: var(--tw-on-surface-variant);
      font: var(--tw-typo-label-md-font);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      white-space: nowrap;
    }
    .ring {
      display: inline-flex;
      width: 24px;
      height: 24px;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--tw-primary);
      border-radius: var(--tw-rounded-full);
      color: var(--tw-on-primary-container);
      font-family: var(--tw-typo-numeric-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-numeric-md-font-weight);
    }
    /* Every tile has a Share button; it shows on the selected, hovered, or
       focused tile and stays a tab stop on all of them. */
    .actions {
      display: flex;
      align-items: center;
      gap: var(--tw-space-sm);
      margin-left: auto;
      opacity: 0;
    }
    :host([selected]) .actions,
    :host(:hover) .actions,
    :host(:focus-within) .actions {
      opacity: 1;
    }
    .share {
      --glyph-size: 14px;
      display: inline-flex;
      align-items: center;
      gap: var(--tw-space-xs);
      ${QUIET_BUTTON}
      padding: 2px var(--tw-space-sm);
      border-color: currentColor;
      background: none;
      color: inherit;
    }
    .share:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 2px;
    }
  `;

  protected override render() {
    const hit = this.hit;
    if (hit === undefined) {
      return nothing;
    }
    const preview = previewOf(hit, this.taxonomy);
    return html`
      <span class="name">${hit.name}</span>
      <span class="meta">${preview.meta}</span>
      <span class="foot">
        ${preview.ring === undefined ? nothing : html`<span class="ring">${preview.ring}</span>`}
        ${preview.badge === undefined ? nothing : html`<span class="badge">${preview.badge}</span>`}
        ${
          this.#standsIn(hit)
            ? html`<span class="year" title=${`From the ${hit.version} rules`}
                >${hit.version}</span
              >`
            : nothing
        }
        <span class="actions">
          <button
            type="button"
            class="share"
            aria-label=${`Share ${hit.name} with the table`}
            @click=${this.#share}
          >
            ${SHARE_ICON} Share
          </button>
        </span>
      </span>
    `;
  }

  // A hit of another version than the viewer reads is standing in for a
  // thing their version lacks.
  #standsIn(hit: SpotlightHit): boolean {
    const version = hit.version ?? "";
    return version !== "" && this.version !== "" && version !== this.version;
  }

  // The click is the button's alone: the option behind it must not open
  // the entry as well.
  #share = (event: Event): void => {
    event.stopPropagation();
    if (this.hit !== undefined) {
      emit(this, "tw-share", this.hit);
    }
  };
}

customElements.define("tw-hit-tile", TwHitTile);

declare global {
  interface HTMLElementTagNameMap {
    "tw-hit-tile": TwHitTile;
  }
  interface HTMLElementEventMap {
    "tw-share": CustomEvent<SpotlightHit>;
  }
}
