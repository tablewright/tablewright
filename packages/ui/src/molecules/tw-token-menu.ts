/**
 * ─ What may be done with a token ─
 *
 * The right button on a token opens this beside it. Today it moves the
 * token between the layer the table sees and the DM's own; a seat that
 * may not keep things back never opens it. Layers are what the words say,
 * since that is what every other table calls this; underneath there are
 * no layers, only the marking a thing carries, so nothing can be in two
 * states at once.
 * Design: docs/permissions.md
 */

import { LitElement, css, html, nothing } from "lit";
import type { Visibility } from "@tablewright/schema";
import { ICON_STYLES, KEPT_ICON, SHOWN_ICON } from "../atoms/icons.js";
import { DismissWhenOutside } from "../utils/dismiss.js";
import { emit } from "../utils/events.js";
import { MENU_ITEM, PANEL_CHROME, QUIET_BUTTON_HOVER } from "../atoms/styles.js";

export class TwTokenMenu extends LitElement {
  static override properties = {
    at: { attribute: false },
    kept: { type: Boolean },
  };

  /** Where on the page it opens, or nothing while it is shut. */
  declare at: { x: number; y: number } | undefined;
  /** Whether the token is kept back from the table as things stand. */
  declare kept: boolean;

  constructor() {
    super();
    this.at = undefined;
    this.kept = false;
    // A press anywhere else shuts it, as a menu does: a press rather than a
    // click, since it opens under a held right button.
    this.addController(
      new DismissWhenOutside(this, {
        event: "pointerdown",
        isOpen: () => this.at !== undefined,
        close: () => this.close(),
      })
    );
  }

  static override styles = css`
    ${ICON_STYLES}
    :host {
      position: fixed;
      z-index: 140;
    }
    :host([hidden]) {
      display: none;
    }
    .menu {
      display: flex;
      flex-direction: column;
      min-width: 168px;
      padding: var(--tw-space-xs);
      ${PANEL_CHROME}
    }
    button {
      display: flex;
      align-items: center;
      gap: var(--tw-space-sm);
      padding: var(--tw-comp-button-quiet-padding) var(--tw-space-sm);
      ${MENU_ITEM}
      color: var(--tw-comp-button-quiet-text-color);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      white-space: nowrap;
    }
    button .glyph {
      flex: none;
      color: var(--tw-on-surface-variant);
    }
    button:hover {
      ${QUIET_BUTTON_HOVER}
    }
  `;

  /** Open beside a token that is, or is not, kept back. */
  open(at: { x: number; y: number }, kept: boolean): void {
    this.at = at;
    this.kept = kept;
    this.hidden = false;
    this.style.left = `${at.x}px`;
    this.style.top = `${at.y}px`;
  }

  close(): void {
    this.at = undefined;
    this.hidden = true;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.hidden = true;
    // The opening right-click releases over the menu; swallow its contextmenu
    // or the browser's own arrives.
    this.addEventListener("contextmenu", this.#ownMenu);
    window.addEventListener("keydown", this.#escape);
  }

  override disconnectedCallback(): void {
    this.removeEventListener("contextmenu", this.#ownMenu);
    window.removeEventListener("keydown", this.#escape);
    super.disconnectedCallback();
  }

  protected override render() {
    if (this.at === undefined) {
      return nothing;
    }
    return html`<div class="menu" role="menu">
      <button type="button" role="menuitem" @click=${this.#mark}>
        ${this.kept ? SHOWN_ICON : KEPT_ICON}
        <span>${this.kept ? "Move to the token layer" : "Move to the DM layer"}</span>
      </button>
    </div>`;
  }

  #mark = (): void => {
    const visibility: Visibility = this.kept ? "party" : "dm";
    emit(this, "tw-token-mark", { visibility });
    this.close();
  };

  #ownMenu = (event: Event): void => {
    event.preventDefault();
  };

  #escape = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.at !== undefined) {
      this.close();
    }
  };
}

customElements.define("tw-token-menu", TwTokenMenu);

declare global {
  interface HTMLElementTagNameMap {
    "tw-token-menu": TwTokenMenu;
  }
  interface HTMLElementEventMap {
    "tw-token-mark": CustomEvent<{ visibility: Visibility }>;
  }
}
