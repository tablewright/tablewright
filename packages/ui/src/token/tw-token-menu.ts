/**
 * ─ What may be done with a token ─
 *
 * The right button on a token opens this beside it. One thing hangs off
 * it today, moving it between the layer the table sees and the DM's own,
 * and everything else a token carries will hang off it in time. A seat
 * that may not keep things back never opens it at all.
 *
 * Layers are what the words say, since that is what every other table
 * calls this; underneath there are no layers, only the marking a thing
 * carries, so nothing can be in two states at once.
 * Design: docs/permissions.md
 */

import { LitElement, css, html, nothing } from "lit";
import type { Visibility } from "@tablewright/schema";
import { KEPT_ICON, SHOWN_ICON } from "../rail/icons.js";

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
  }

  static override styles = css`
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
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-panel-rounded);
      background: var(--tw-comp-panel-background-color);
    }
    button {
      display: flex;
      align-items: center;
      gap: var(--tw-space-sm);
      padding: var(--tw-comp-button-quiet-padding) var(--tw-space-sm);
      border: 0;
      border-radius: var(--tw-comp-button-quiet-rounded);
      background: none;
      color: var(--tw-comp-button-quiet-text-color);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      text-align: left;
      white-space: nowrap;
      cursor: pointer;
    }
    /* The icon says which, as it does on the rail; the words say what,
       since a menu is read rather than learned by position. */
    button svg {
      flex: none;
      color: var(--tw-on-surface-variant);
    }
    button:hover {
      background: var(--tw-surface-container-highest);
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
    // The menu opens under the pointer, so the button that opened it is
    // released over this rather than over the board: without this the
    // browser's own menu arrives on the way up.
    this.addEventListener("contextmenu", this.#ownMenu);
    window.addEventListener("pointerdown", this.#elsewhere, true);
    window.addEventListener("keydown", this.#escape);
  }

  override disconnectedCallback(): void {
    this.removeEventListener("contextmenu", this.#ownMenu);
    window.removeEventListener("pointerdown", this.#elsewhere, true);
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
    this.dispatchEvent(
      new CustomEvent("tw-token-mark", { detail: { visibility }, bubbles: true, composed: true })
    );
    this.close();
  };

  #ownMenu = (event: Event): void => {
    event.preventDefault();
  };

  // A press anywhere else shuts it, as a menu does.
  #elsewhere = (event: PointerEvent): void => {
    if (this.at !== undefined && !event.composedPath().includes(this)) {
      this.close();
    }
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
}
