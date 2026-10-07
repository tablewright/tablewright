/**
 * ─ Side view ─
 *
 * The slice along a template's aim at one scale both ways, as a strip
 * along the board's foot for the seat that lays it, or as a card about one
 * token for the others. The strip has the plot on the left and a line for
 * each token near it on the right; the card has the template's name, the
 * plot closed in on its token and what decides it, its line, and an X. It
 * only shows; the X is the one thing in it to press.
 * Design: docs/templates.md "The side view".
 */

import { LitElement, html, nothing } from "lit";
import type { SideToken, SideView } from "@tablewright/board";
import { CLOSE_ICON } from "../../atoms/icons.js";
import { emit } from "../../utils/events.js";
import { lineOf } from "./lines.js";
import { discOf, plotOf, plotRoom } from "./plot.js";
import { SIDE_VIEW_STYLES } from "./styles.js";
import { cardWindow } from "./window.js";

// A line's disc, in pixels.
const DISC_BOX = 22;

export class TwSideView extends LitElement {
  static override properties = {
    view: { attribute: false },
    token: { attribute: false },
    plotSize: { state: true },
  };

  /** What the slice shows, or nothing while no template with a direction is down. */
  declare view: SideView | undefined;
  /** The token a card is about, by its id; unset, the view is the whole strip. */
  declare token: string | undefined;
  /** The plot's box in pixels, as it was last laid out. */
  declare plotSize: { readonly width: number; readonly height: number };

  // The plot is drawn to its box at one scale both ways, so it is drawn
  // again whenever the box changes size.
  readonly #observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (box !== undefined) {
      this.plotSize = { width: box.width, height: box.height };
    }
  });

  constructor() {
    super();
    this.view = undefined;
    this.token = undefined;
    this.plotSize = { width: 0, height: 0 };
  }

  static override styles = SIDE_VIEW_STYLES;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#watchPlot();
  }

  override disconnectedCallback(): void {
    this.#observer.disconnect();
    super.disconnectedCallback();
  }

  override firstUpdated(): void {
    this.#watchPlot();
  }

  // A card is styled as one by the attribute.
  override willUpdate(): void {
    this.toggleAttribute("card", this.token !== undefined);
  }

  // The plot's box is there from the first render on, shown or not, so the
  // size it has once shown is heard.
  #watchPlot(): void {
    const plot = this.renderRoot.querySelector(".plot");
    if (plot !== null) {
      this.#observer.observe(plot);
    }
  }

  override render() {
    const { view } = this;
    if (this.token === undefined) {
      return html`<header>
          <span class="cap">Side view</span>
          <span class="label">${view?.label}</span>
        </header>
        ${this.#plot(view)}
        <ul class="lines">
          ${view === undefined ? nothing : view.tokens.map((token) => this.#line(token, view.unit))}
        </ul>`;
    }
    const token = view?.tokens.find((one) => one.id === this.token);
    // A card's plot shows its own token alone beside the one the template
    // leaves from, closed in on what decides it.
    const shown =
      view === undefined || token === undefined ? undefined : { ...view, tokens: [token] };
    return html`<header>
        <span class="label">${view?.label}</span>
        <button class="close" type="button" aria-label="Close" @click=${this.#close}>
          ${CLOSE_ICON}
        </button>
      </header>
      ${this.#plot(shown, token)}
      <ul class="lines">
        ${view === undefined || token === undefined ? nothing : this.#line(token, view.unit)}
      </ul>`;
  }

  // The plot of `view`, whole, or closed in on `token`.
  #plot(view: SideView | undefined, token?: SideToken) {
    const { width, height } = this.plotSize;
    const isDrawn = view !== undefined && width > 0 && height > 0;
    return html`<div class="plot">
      ${
        isDrawn
          ? html`<svg width=${width} height=${height} aria-hidden="true">
              ${plotOf(
                view,
                width,
                height,
                token === undefined ? undefined : cardWindow(view, token, plotRoom(width, height))
              )}
            </svg>`
          : nothing
      }
    </div>`;
  }

  #line(token: SideToken, unit: string) {
    return html`<li class="line" data-verdict=${token.verdict.kind}>
      <svg width=${DISC_BOX} height=${DISC_BOX} aria-hidden="true">
        ${discOf(DISC_BOX / 2, DISC_BOX / 2, token.label)}
      </svg>
      <span class="words">${lineOf(token.verdict, unit)}</span>
    </li>`;
  }

  #close = (): void => {
    if (this.token !== undefined) {
      emit(this, "tw-card-close", { id: this.token });
    }
  };
}

customElements.define("tw-side-view", TwSideView);

declare global {
  interface HTMLElementTagNameMap {
    "tw-side-view": TwSideView;
  }
  interface HTMLElementEventMap {
    "tw-card-close": CustomEvent<{ id: string }>;
  }
}
