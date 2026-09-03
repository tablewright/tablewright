// Where shared entries land: one card at a time, the rest queued behind
// it, the next stepping up when the current one is dismissed. A share
// never stacks over another and none is lost.
//
// `tw-open` from the card bubbles through to the host, which opens the
// entry; opening also dismisses the card.

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
        @tw-dismiss=${this.#dismissed}
        @tw-open=${this.#opened}
      ></tw-share-card>
    `;
  }

  // Dismiss drops the card and nothing else; the tray is its host, so the
  // event stops here.
  #dismissed = (event: Event): void => {
    event.stopPropagation();
    this.#advance();
  };

  // Opening the entry also clears the card: the reader has it now. The
  // event carries on to the host, which opens the page.
  #opened = (): void => {
    this.#advance();
  };

  #advance(): void {
    this.queue = this.queue.slice(1);
  }
}

customElements.define("tw-share-tray", TwShareTray);

declare global {
  interface HTMLElementTagNameMap {
    "tw-share-tray": TwShareTray;
  }
}
