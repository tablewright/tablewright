// The scene tab: names the scene on show for everyone and, for the DM,
// opens the list of scenes to switch, add a blank one by name, or add a
// reference drawing as a scene. The DM screen's Scenes leaf takes the list
// over later; the tab stays.
//
// `tw-scene-open` carries the id to switch to; `tw-scene-create` the name
// of the new scene and, for a reference drawing, which one it is.

import { LitElement, css, html, nothing } from "lit";
import type { SceneSummary } from "@tablewright/schema";
import { emit } from "../events.js";
import { FOCUS_RING, MENU_ITEM, PANEL_CHROME, QUIET_BUTTON_HOVER } from "../styles.js";
import { nameFrom } from "../text.js";

export class TwScenes extends LitElement {
  static override properties = {
    scenes: { attribute: false },
    current: { type: String },
    references: { attribute: false },
    canManage: { type: Boolean, attribute: "can-manage" },
    open: { state: true },
  };

  declare scenes: SceneSummary[];
  /** The id of the scene on show. */
  declare current: string;
  /** The names of the reference drawings on offer. */
  declare references: string[];
  /** Whether the tab opens the list: the DM's, never a player's. */
  declare canManage: boolean;
  declare open: boolean;

  constructor() {
    super();
    this.scenes = [];
    this.current = "";
    this.references = [];
    this.canManage = false;
    this.open = false;
  }

  static override styles = css`
    :host {
      position: relative;
      display: inline-block;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: var(--tw-space-sm);
      padding: var(--tw-comp-button-quiet-padding) var(--tw-space-md);
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-button-quiet-rounded);
      background: var(--tw-comp-panel-background-color);
      color: var(--tw-on-surface);
      font: var(--tw-typo-label-md-font);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
    }
    button.tab {
      cursor: pointer;
    }
    button.tab:hover,
    button.tab[aria-expanded="true"] {
      ${QUIET_BUTTON_HOVER}
    }
    .tab svg {
      display: block;
      color: var(--tw-primary);
    }
    .menu {
      position: absolute;
      top: calc(100% + var(--tw-space-xs));
      left: 0;
      z-index: 150;
      min-width: 240px;
      padding: var(--tw-space-xs);
      ${PANEL_CHROME}
      color: var(--tw-comp-panel-text-color);
      box-shadow: 0 8px 24px var(--tw-shadow-panel);
    }
    .menu button {
      display: block;
      width: 100%;
      padding: var(--tw-space-sm) var(--tw-space-md);
      ${MENU_ITEM}
      color: inherit;
      font: inherit;
    }
    .menu button:hover {
      ${QUIET_BUTTON_HOVER}
    }
    .menu button[aria-current="true"] {
      color: var(--tw-primary);
    }
    .label {
      margin: var(--tw-space-sm) var(--tw-space-md) var(--tw-space-xs);
      color: var(--tw-comp-panel-title-text-color);
      font: var(--tw-comp-panel-title-font);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      text-transform: uppercase;
    }
    form {
      display: flex;
      gap: var(--tw-space-xs);
      padding: var(--tw-space-xs);
    }
    input {
      flex: 1;
      min-width: 0;
      padding: var(--tw-comp-input-padding);
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-input-rounded);
      background: var(--tw-comp-input-background-color);
      color: var(--tw-comp-input-text-color);
      font: inherit;
    }
    .menu form button {
      width: auto;
    }
    ${FOCUS_RING}
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.#outside, { capture: true });
  }

  override disconnectedCallback(): void {
    document.removeEventListener("click", this.#outside, { capture: true });
    super.disconnectedCallback();
  }

  override render() {
    const name = this.scenes.find((scene) => scene.id === this.current)?.name ?? "Scene";
    const icon = html`<svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 3.5 6 2l4 1.5L14.5 2v10.5L10 14l-4-1.5L1.5 14z"></path>
      <path d="M6 2v10.5M10 3.5V14"></path>
    </svg>`;
    if (!this.canManage) {
      return html`<span class="tab" aria-label="Current scene">${icon}<span>${name}</span></span>`;
    }
    return html`
      <button
        class="tab"
        type="button"
        aria-haspopup="menu"
        aria-expanded=${this.open ? "true" : "false"}
        @click=${this.#toggle}
      >
        ${icon}<span>${name}</span>
      </button>
      ${this.open ? this.#menu() : nothing}
    `;
  }

  #menu() {
    return html`<div class="menu" role="menu" @keydown=${this.#keydown}>
      <p class="label">Scenes</p>
      ${this.scenes.map(
        (scene) =>
          html`<button
            type="button"
            role="menuitem"
            aria-current=${scene.id === this.current ? "true" : nothing}
            @click=${() => this.#choose(scene.id)}
          >
            ${scene.name}
          </button>`
      )}
      <form @submit=${this.#create}>
        <input
          name="name"
          placeholder="New scene"
          aria-label="New scene name"
          autocomplete="off"
          required
        />
        <button type="submit">Add</button>
      </form>
      ${
        this.references.length > 0
          ? html`<p class="label">Reference drawings</p>
              ${this.references.map(
                (reference) =>
                  html`<button
                    type="button"
                    role="menuitem"
                    @click=${() => this.#reference(reference)}
                  >
                    Add ${reference}
                  </button>`
              )}`
          : nothing
      }
    </div>`;
  }

  #toggle = (): void => {
    this.open = !this.open;
  };

  #choose(id: string): void {
    this.open = false;
    if (id !== this.current) {
      emit(this, "tw-scene-open", { id });
    }
  }

  #create = (event: Event): void => {
    event.preventDefault();
    const name = nameFrom(event.currentTarget);
    if (name === undefined) {
      return;
    }
    this.open = false;
    emit(this, "tw-scene-create", { name });
  };

  #reference(name: string): void {
    this.open = false;
    emit(this, "tw-scene-create", { name, reference: name });
  }

  #keydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.open = false;
    }
  };

  // A click anywhere else shuts the list, as a menu does.
  #outside = (event: Event): void => {
    if (this.open && !event.composedPath().includes(this)) {
      this.open = false;
    }
  };
}

customElements.define("tw-scenes", TwScenes);

declare global {
  interface HTMLElementTagNameMap {
    "tw-scenes": TwScenes;
  }
  interface HTMLElementEventMap {
    "tw-scene-open": CustomEvent<{ id: string }>;
    "tw-scene-create": CustomEvent<{ name: string; reference?: string }>;
  }
}
