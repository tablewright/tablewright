/**
 * ─ Template cards ─
 *
 * The cards a template laid in another seat deals this one: a small side
 * view for each token it names, beside the token on screen with a thin
 * line to it, stepping aside rather than covering another card. The app
 * hands it the side view, whose tokens are the cards still open, and where
 * each token stands as the board moves. A card goes with its X, and Escape
 * closes the newest, which is the last dealt and sits on top.
 * Design: docs/templates.md "The side view".
 */

import { LitElement, css, html, nothing, svg } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { SideToken, SideView } from "@tablewright/board";
import { emit } from "../../utils/events.js";
import "../../molecules/side-view/tw-side-view.js";
import { placeCards, type CardAnchor } from "./places.js";

// How large a card is taken to be until it has been laid out, in pixels.
const FIRST_SIZE = { width: 280, height: 220 };

type Size = { readonly width: number; readonly height: number };

export class TwTemplateCards extends LitElement {
  static override properties = {
    view: { attribute: false },
    anchors: { attribute: false },
    sizes: { state: true },
  };

  /** The side view the cards are dealt from, its tokens the cards still open, or nothing. */
  declare view: SideView | undefined;
  /** Where each card's token stands on screen, by its id; a card without one is not shown. */
  declare anchors: ReadonlyMap<string, CardAnchor>;
  /** How large each card was laid out, by its token's id. */
  declare sizes: ReadonlyMap<string, Size>;

  // A card's size is known once it is laid out, and it is placed by it.
  // Each card is watched once: watching one again would hear it afresh.
  #watched = new WeakSet<Element>();
  readonly #observer = new ResizeObserver((entries) => {
    const sizes = new Map(this.sizes);
    let isChanged = false;
    for (const entry of entries) {
      const box = entry.borderBoxSize[0];
      const id = entry.target instanceof HTMLElement ? entry.target.dataset["token"] : undefined;
      if (box === undefined || id === undefined) {
        continue;
      }
      // A card taken off the page measures nothing, and is let go of.
      if (box.inlineSize === 0) {
        this.#observer.unobserve(entry.target);
        this.#watched.delete(entry.target);
        continue;
      }
      sizes.set(id, { width: box.inlineSize, height: box.blockSize });
      isChanged = true;
    }
    if (isChanged) {
      this.sizes = sizes;
    }
  });

  constructor() {
    super();
    this.view = undefined;
    this.anchors = new Map();
    this.sizes = new Map();
  }

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      /* Over the board and the strip, under the rail and every panel. */
      z-index: 115;
      pointer-events: none;
    }
    .leads {
      position: absolute;
      inset: 0;
    }
    line {
      stroke: var(--tw-board-ruler);
      stroke-opacity: 0.6;
      stroke-width: 1.2;
    }
  `;

  /** How many cards are on show. */
  get length(): number {
    return this.#shown().length;
  }

  /** Close the newest card on show, as its X would. */
  closeNewest(): void {
    const newest = this.#shown().at(-1);
    if (newest !== undefined) {
      emit(this, "tw-card-close", { id: newest.token.id });
    }
  }

  override disconnectedCallback(): void {
    this.#observer.disconnect();
    this.#watched = new WeakSet();
    super.disconnectedCallback();
  }

  override updated(): void {
    for (const card of this.renderRoot.querySelectorAll("tw-side-view")) {
      if (!this.#watched.has(card)) {
        this.#watched.add(card);
        this.#observer.observe(card);
      }
    }
  }

  override render() {
    const { view } = this;
    if (view === undefined) {
      return nothing;
    }
    const screen = { width: window.innerWidth, height: window.innerHeight };
    const placed = placeCards(
      this.#shown().map(({ token, anchor }) => ({
        id: token.id,
        anchor,
        ...(this.sizes.get(token.id) ?? FIRST_SIZE),
      })),
      screen
    );
    return html`<svg class="leads" width=${screen.width} height=${screen.height} aria-hidden="true">
        ${placed.map(({ line }) =>
          line === undefined
            ? nothing
            : svg`<line x1=${line.from.x} y1=${line.from.y} x2=${line.to.x} y2=${line.to.y}></line>`
        )}
      </svg>
      ${repeat(
        placed,
        (card) => card.id,
        (card) =>
          html`<tw-side-view
            data-token=${card.id}
            .view=${view}
            .token=${card.id}
            style=${`left: ${card.box.left}px; top: ${card.box.top}px`}
          ></tw-side-view>`
      )}`;
  }

  // The open cards whose tokens stand on the board, in the order dealt.
  #shown(): { token: SideToken; anchor: CardAnchor }[] {
    return (this.view?.tokens ?? []).flatMap((token) => {
      const anchor = this.anchors.get(token.id);
      return anchor === undefined ? [] : [{ token, anchor }];
    });
  }
}

customElements.define("tw-template-cards", TwTemplateCards);

declare global {
  interface HTMLElementTagNameMap {
    "tw-template-cards": TwTemplateCards;
  }
}
