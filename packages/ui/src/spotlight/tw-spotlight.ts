// The Spotlight-style search box (design.md §3): one input, one flat ranked
// list with a type badge per row, driven by the keyboard. It is mounted
// once and hidden, so opening costs nothing but a class change, and every
// answer that arrives after a newer keystroke is dropped: latest wins.
//
// Events: `tw-select` (detail: the chosen hit) when a row is activated.

import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import type { SearchAnswer, Searcher, SpotlightHit } from "./searcher.js";

type Status = "idle" | "searching" | "done" | "error";

const HANDLED_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"]);

export class TwSpotlight extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    placeholder: { type: String },
    searcher: { attribute: false },
    query: { state: true },
    hits: { state: true },
    selected: { state: true },
    status: { state: true },
    message: { state: true },
    elapsedUs: { state: true },
    catalogueSize: { state: true },
    paintMs: { state: true },
  };

  declare open: boolean;
  declare placeholder: string;
  declare searcher: Searcher | undefined;
  declare query: string;
  declare hits: SpotlightHit[];
  declare selected: number;
  declare status: Status;
  declare message: string;
  declare elapsedUs: number;
  declare catalogueSize: number;
  declare paintMs: number;

  // Every search gets a number; an answer whose number is no longer the
  // latest is stale and is thrown away.
  #sequence = 0;

  constructor() {
    super();
    this.open = false;
    this.placeholder = "Search the compendium";
    this.searcher = undefined;
    this.query = "";
    this.hits = [];
    this.selected = 0;
    this.status = "idle";
    this.message = "";
    this.elapsedUs = 0;
    this.catalogueSize = 0;
    this.paintMs = 0;
  }

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: block;
    }
    :host(:not([open])) {
      display: none;
    }
    .scrim {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 0.25);
    }
    .box {
      position: absolute;
      top: 12vh;
      left: 50%;
      transform: translateX(-50%);
      width: min(640px, 92vw);
      max-height: 64vh;
      display: flex;
      flex-direction: column;
      background: var(--tw-comp-panel-background-color);
      color: var(--tw-comp-panel-text-color);
      font-family: var(--tw-comp-panel-font-family);
      font-size: var(--tw-comp-panel-font-size);
      line-height: var(--tw-comp-panel-line-height);
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-comp-panel-rounded);
      box-shadow: 0 24px 48px rgb(0 0 0 / 0.45);
      overflow: hidden;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      padding: var(--tw-space-md) var(--tw-space-lg);
      border: 0;
      border-bottom: 1px solid var(--tw-outline-variant);
      outline: none;
      background: var(--tw-comp-input-background-color);
      color: var(--tw-comp-input-text-color);
      font-family: var(--tw-comp-input-font-family);
      font-size: var(--tw-typo-headline-sm-font-size);
      font-weight: var(--tw-comp-input-font-weight);
      line-height: var(--tw-typo-headline-sm-line-height);
    }
    input::placeholder {
      color: var(--tw-on-surface-variant);
    }
    ul {
      margin: 0;
      padding: var(--tw-space-xs) 0;
      list-style: none;
      overflow-y: auto;
      flex: 1 1 auto;
    }
    ul:empty {
      display: none;
    }
    li {
      display: grid;
      grid-template-columns: 1fr auto;
      column-gap: var(--tw-space-md);
      align-items: baseline;
      padding: var(--tw-space-sm) var(--tw-space-lg);
      cursor: pointer;
    }
    li[aria-selected="true"] {
      background: var(--tw-primary-container);
      color: var(--tw-on-primary-container);
    }
    .badge {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
      justify-self: end;
      padding: 0 var(--tw-space-sm);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-highest);
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      text-transform: uppercase;
      white-space: nowrap;
    }
    li[aria-selected="true"] .badge {
      background: var(--tw-primary);
      color: var(--tw-on-primary);
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta {
      grid-column: 1;
      color: var(--tw-on-surface-variant);
      font-size: var(--tw-typo-body-sm-font-size);
      line-height: var(--tw-typo-body-sm-line-height);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    li[aria-selected="true"] .meta {
      color: inherit;
    }
    footer {
      padding: var(--tw-space-xs) var(--tw-space-lg);
      border-top: 1px solid var(--tw-outline-variant);
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-numeric-md-font-family);
      font-size: var(--tw-typo-body-sm-font-size);
      line-height: var(--tw-typo-body-sm-line-height);
      font-variant-numeric: tabular-nums;
    }
    footer[data-status="error"] {
      color: var(--tw-error);
    }
  `;

  /** Open the box with the previous query selected, ready to be replaced. */
  show(): void {
    this.open = true;
    void this.updateComplete.then(() => {
      const input = this.#input();
      input?.focus();
      input?.select();
    });
  }

  hide(): void {
    this.open = false;
  }

  toggle(): void {
    if (this.open) {
      this.hide();
    } else {
      this.show();
    }
  }

  protected override render() {
    return html`
      <div class="scrim" @click=${this.hide}></div>
      <div class="box" role="dialog" aria-label="Search the compendium">
        <input
          type="text"
          .value=${this.query}
          placeholder=${this.placeholder}
          autocomplete="off"
          spellcheck="false"
          aria-controls="hits"
          aria-activedescendant=${this.hits.length === 0 ? nothing : `hit-${this.selected}`}
          @input=${this.#onInput}
          @keydown=${this.#onKeydown}
        />
        <ul id="hits" role="listbox">
          ${this.hits.map((hit, index) => this.#renderHit(hit, index))}
        </ul>
        <footer data-status=${this.status}>${this.#footer()}</footer>
      </div>
    `;
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has("selected") || changed.has("hits")) {
      this.renderRoot.querySelector(`#hit-${this.selected}`)?.scrollIntoView({ block: "nearest" });
    }
  }

  #renderHit(hit: SpotlightHit, index: number) {
    const meta = hit.tags.length > 0 ? hit.tags.join(" · ") : hit.source;
    return html`
      <li
        id=${`hit-${index}`}
        role="option"
        aria-selected=${index === this.selected ? "true" : "false"}
        @pointermove=${() => this.#select(index)}
        @click=${() => this.#choose(index)}
      >
        <span class="name">${hit.name}</span>
        <span class="meta">${meta}</span>
        <span class="badge">${hit.type}</span>
      </li>
    `;
  }

  #footer() {
    switch (this.status) {
      case "idle":
        return "Type to search. Narrow with type:spell, tag:fire, or source:5e-2024-srd.";
      case "error":
        return this.message;
      case "searching":
      case "done": {
        const count = this.hits.length === 0 ? "No matches" : `${this.hits.length} hits`;
        const core = (this.elapsedUs / 1000).toFixed(2);
        const paint = this.paintMs.toFixed(0);
        return `${count} of ${this.catalogueSize} · core ${core} ms · to paint ${paint} ms`;
      }
    }
  }

  #input(): HTMLInputElement | null {
    return this.renderRoot.querySelector("input");
  }

  #onInput = (event: Event): void => {
    this.query = (event.target as HTMLInputElement).value;
    void this.#search(performance.now());
  };

  #onKeydown = (event: KeyboardEvent): void => {
    // Keys the box handles are its own; nothing behind it may act on them.
    if (HANDLED_KEYS.has(event.key)) {
      event.stopPropagation();
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.#select(this.#step(1));
        break;
      case "ArrowUp":
        event.preventDefault();
        this.#select(this.#step(-1));
        break;
      case "Home":
        event.preventDefault();
        this.#select(0);
        break;
      case "End":
        event.preventDefault();
        this.#select(this.hits.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        this.#choose(this.selected);
        break;
      case "Escape":
        event.preventDefault();
        this.hide();
        break;
      default:
        break;
    }
  };

  // Wraps at both ends, as Spotlight does.
  #step(delta: number): number {
    const count = this.hits.length;
    if (count === 0) {
      return 0;
    }
    return (this.selected + delta + count) % count;
  }

  #select(index: number): void {
    if (index >= 0 && index < this.hits.length) {
      this.selected = index;
    }
  }

  #choose(index: number): void {
    const hit = this.hits[index];
    if (hit === undefined) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<SpotlightHit>("tw-select", { detail: hit, bubbles: true, composed: true })
    );
    this.hide();
  }

  // One search per keystroke, no debounce: the core answers in well under a
  // millisecond, and a debounce would only add latency. Latest wins.
  async #search(startedAt: number): Promise<void> {
    const sequence = ++this.#sequence;
    const query = this.query;
    if (query.trim() === "") {
      this.hits = [];
      this.selected = 0;
      this.status = "idle";
      return;
    }
    if (this.searcher === undefined) {
      this.status = "error";
      this.message = "No search is connected.";
      return;
    }
    this.status = "searching";
    let answer: SearchAnswer;
    try {
      answer = await this.searcher(query);
    } catch (error) {
      if (sequence !== this.#sequence) {
        return;
      }
      this.status = "error";
      this.message = error instanceof Error ? error.message : String(error);
      return;
    }
    if (sequence !== this.#sequence) {
      return;
    }
    this.hits = answer.hits;
    this.selected = 0;
    this.elapsedUs = answer.elapsedUs;
    this.catalogueSize = answer.catalogueSize;
    this.status = "done";
    // The readout is keystroke to paint. The DOM commit is measured first so
    // the number is always this keystroke's; the frame after it, when one
    // comes, refines it to the paint. A throttled tab never paints late and
    // stale.
    await this.updateComplete;
    if (sequence !== this.#sequence) {
      return;
    }
    this.paintMs = performance.now() - startedAt;
    requestAnimationFrame(() => {
      if (sequence === this.#sequence) {
        this.paintMs = performance.now() - startedAt;
      }
    });
  }
}

customElements.define("tw-spotlight", TwSpotlight);

declare global {
  interface HTMLElementTagNameMap {
    "tw-spotlight": TwSpotlight;
  }
}
