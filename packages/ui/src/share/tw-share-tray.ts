// Where shared entries land: one card at a time, the rest queued behind
// it, the next stepping up when the current one is dismissed. A share
// never stacks over another and none is lost.
//
// `tw-open` from the card bubbles through unchanged; the host opens the
// entry.

import { LitElement, css, html, nothing } from "lit";
import type { SpotlightHit } from "../spotlight/searcher.js";
import "./tw-share-card.js";

export interface Share {
  hit: SpotlightHit;
  sharedBy: string;
}

export class TwShareTray extends LitElement {
  static override properties = {
    queue: { state: true },
  };

  declare queue: Share[];

  constructor() {
    super();
    this.queue = [];
  }

  static override styles = css`
    :host {
      position: fixed;
      right: var(--tw-space-lg);
      bottom: var(--tw-space-lg);
      /* Above the search box, so a card stays usable while the box is open. */
      z-index: 200;
      display: block;
      width: min(360px, 92vw);
    }
  `;

  /** Queue a share; it shows at once if nothing is showing. */
  push(hit: SpotlightHit, sharedBy: string): void {
    this.queue = [...this.queue, { hit, sharedBy }];
  }

  /** How many shares are queued, the visible one included. */
  get length(): number {
    return this.queue.length;
  }

  protected override render() {
    const current = this.queue[0];
    if (current === undefined) {
      return nothing;
    }
    return html`
      <tw-share-card
        .hit=${current.hit}
        shared-by=${current.sharedBy}
        .pending=${this.queue.length - 1}
        @tw-dismiss=${this.#next}
      ></tw-share-card>
    `;
  }

  #next = (event: Event): void => {
    // The card's own event is consumed here; the tray is its host.
    event.stopPropagation();
    this.queue = this.queue.slice(1);
  };
}

customElements.define("tw-share-tray", TwShareTray);

declare global {
  interface HTMLElementTagNameMap {
    "tw-share-tray": TwShareTray;
  }
}
