/**
 * ─ Side view ─
 *
 * The slice along a template's aim, docked along the board's foot while
 * the seat that lays it has one with a direction on the board: the plot
 * on the left, the ground and the tokens and the template's cut at one
 * scale both ways, and on the right a line for each token near it. It
 * only shows; nothing in it is pressed or dragged. The app hands it the
 * side view whole and hides it when there is none.
 * Design: docs/templates.md "The side view".
 */

import { LitElement, html, nothing } from "lit";
import type { SideToken, SideView } from "@tablewright/board";
import { lineOf } from "./lines.js";
import { discOf, plotOf } from "./plot.js";
import { SIDE_VIEW_STYLES } from "./styles.js";

// A line's disc, in pixels.
const DISC_BOX = 22;

export class TwSideView extends LitElement {
  static override properties = {
    view: { attribute: false },
    plotSize: { state: true },
  };

  /** What the slice shows, or nothing while no template with a direction is down. */
  declare view: SideView | undefined;
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
    const { width, height } = this.plotSize;
    return html`<header>
        <span class="cap">Side view</span>
        <span class="label">${view?.label}</span>
      </header>
      <div class="plot">
        ${
          view !== undefined && width > 0 && height > 0
            ? html`<svg width=${width} height=${height} aria-hidden="true">
                ${plotOf(view, width, height)}
              </svg>`
            : nothing
        }
      </div>
      <ul class="lines">
        ${view === undefined ? nothing : view.tokens.map((token) => this.#line(token, view.unit))}
      </ul>`;
  }

  #line(token: SideToken, unit: string) {
    return html`<li class="line" data-verdict=${token.verdict.kind}>
      <svg width=${DISC_BOX} height=${DISC_BOX} aria-hidden="true">
        ${discOf(DISC_BOX / 2, DISC_BOX / 2, token.label)}
      </svg>
      <span class="words">${lineOf(token.verdict, unit)}</span>
    </li>`;
  }
}

customElements.define("tw-side-view", TwSideView);

declare global {
  interface HTMLElementTagNameMap {
    "tw-side-view": TwSideView;
  }
}
