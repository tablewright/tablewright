// The Spotlight-style search box (design.md §3): one input pinned to the
// left edge, the rest of the screen dimmed, results as tiles two per row
// grouped by category, with groups ordered by their best hit. It is
// mounted once and hidden, so opening costs nothing but a class change,
// and every answer that arrives after a newer keystroke is dropped:
// latest wins.
//
// Events, both with the hit as `detail`:
// - `tw-select`: a tile was activated (Enter or click).
// - `tw-share`: a tile was dragged out of the box (the whole tile is the
//   handle), or its Share button pressed. The host turns it into a card
//   for the table.

import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import type { ControlSpec, SystemManifest, Understood } from "@tablewright/schema";
import "../filters/tw-filter-tray.js";
import { activeCount, filtersOf, selectionOf } from "../filters/state.js";
import type { TrayState } from "../filters/state.js";
import { categoryOf, groupHits, previewOf } from "./preview.js";
import type { Taxonomy } from "./preview.js";
import type { HitGroup } from "./preview.js";
import type { SearchAnswer, Searcher, SpotlightHit } from "./searcher.js";

type Status = "idle" | "searching" | "done" | "error";

const FUNNEL_ICON = html`<svg
  width="12"
  height="12"
  viewBox="0 0 12 12"
  fill="none"
  stroke="currentColor"
  stroke-width="1.4"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M1 2h10L7.5 6.5V10l-3 1V6.5z"></path>
</svg>`;

const HANDLED_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"]);

const SHARE_ICON = html`<svg
  width="14"
  height="14"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <circle cx="6" cy="5.5" r="2.5"></circle>
  <path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"></path>
  <circle cx="11.5" cy="6" r="2"></circle>
  <path d="M14.5 13.5c0-2-1.3-3.4-3.2-3.8"></path>
</svg>`;

export class TwSpotlight extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    placeholder: { type: String },
    searcher: { attribute: false },
    taxonomy: { attribute: false },
    system: { attribute: false },
    facetValues: { attribute: false },
    version: { type: String },
    query: { state: true },
    hits: { state: true },
    understood: { state: true },
    trayState: { state: true },
    trayOpen: { state: true },
    filter: { state: true },
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
  /** Kind to category label; derived from `system` unless set outright. */
  declare taxonomy: Taxonomy | undefined;
  /** The system manifest: categories, kinds, and the tray's controls per kind. */
  declare system: SystemManifest | undefined;
  /** Facet name to the values the data holds, for chips without stops. */
  declare facetValues: Record<string, string[]>;
  /**
   * The rule version this viewer reads. A hit of another version is a
   * stand-in, badged with its own version so the reader knows.
   */
  declare version: string;
  declare query: string;
  declare hits: SpotlightHit[];
  /** What the parser made of the typed text on the last answer. */
  declare understood: Understood[];
  /** What the tray holds, by control index; cleared when the tab changes. */
  declare trayState: TrayState;
  declare trayOpen: boolean;
  /** The category tab in force, or undefined for all. */
  declare filter: string | undefined;
  declare selected: number;
  declare status: Status;
  declare message: string;
  declare elapsedUs: number;
  declare catalogueSize: number;
  declare paintMs: number;

  // Every search gets a number; an answer whose number is no longer the
  // latest is stale and is thrown away.
  #sequence = 0;
  // The hit under the pointer during a drag, shared when it lands outside.
  #dragging: SpotlightHit | undefined;
  // Set when the arrows were pressed on a tile, so focus follows the selection.
  #focusTile = false;
  // Derived from hits and filter once per update, not per render call.
  #groups: HitGroup[] = [];
  #visible: SpotlightHit[] = [];
  // Kind to category label, from the system when no taxonomy was given.
  #derived: Taxonomy | undefined;

  constructor() {
    super();
    this.open = false;
    this.placeholder = "Search the compendium";
    this.searcher = undefined;
    this.taxonomy = undefined;
    this.system = undefined;
    this.facetValues = {};
    this.version = "";
    this.query = "";
    this.hits = [];
    this.understood = [];
    this.trayState = {};
    this.trayOpen = false;
    this.filter = undefined;
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
      background: rgb(0 0 0 / 0.35);
    }
    .box {
      position: absolute;
      top: var(--tw-space-lg);
      bottom: var(--tw-space-lg);
      left: var(--tw-space-lg);
      width: min(440px, calc(100vw - 2 * var(--tw-space-lg)));
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      background: var(--tw-comp-panel-background-color);
      color: var(--tw-comp-panel-text-color);
      font-family: var(--tw-comp-panel-font-family);
      font-size: var(--tw-comp-panel-font-size);
      line-height: var(--tw-comp-panel-line-height);
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-comp-panel-rounded);
      overflow: hidden;
    }
    .field {
      position: relative;
    }
    /* The words stay the words: the input's own text is painted transparent
       and the mask over it draws the same text with what the parser
       understood underlined, and what the tray overruled greyed. */
    input,
    .mask {
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      padding: var(--tw-space-md) var(--tw-space-lg);
      border: 0;
      border-bottom: 1px solid var(--tw-outline-variant);
      font-family: var(--tw-comp-input-font-family);
      font-size: var(--tw-typo-headline-sm-font-size);
      font-weight: var(--tw-comp-input-font-weight);
      line-height: var(--tw-typo-headline-sm-line-height);
    }
    input {
      outline: none;
      background: var(--tw-comp-input-background-color);
      color: transparent;
      caret-color: var(--tw-comp-input-text-color);
    }
    input::placeholder {
      color: var(--tw-on-surface-variant);
    }
    .mask {
      position: absolute;
      inset: 0;
      border-bottom-color: transparent;
      overflow: hidden;
      white-space: pre;
      pointer-events: none;
      color: var(--tw-comp-input-text-color);
    }
    .mask u {
      text-decoration: underline;
      text-decoration-color: var(--tw-primary);
      text-decoration-thickness: 1.5px;
      text-underline-offset: 4px;
    }
    .mask .masked {
      color: var(--tw-on-surface-variant);
      opacity: 0.6;
    }
    .funnel {
      display: inline-flex;
      align-items: center;
      gap: var(--tw-space-xs);
      margin-left: auto;
    }
    .funnel[aria-pressed="true"] {
      border: 1px solid var(--tw-primary);
    }
    /* Screen order: input, tabs, results, footer. DOM order puts the tabs after
       the results so the tab key reaches the selected tile before them. */
    .tabs {
      order: 1;
      display: flex;
      flex-wrap: wrap;
      gap: var(--tw-space-sm);
      padding: var(--tw-space-sm) var(--tw-space-lg) var(--tw-space-xs);
    }
    .tabs:empty {
      display: none;
    }
    .tab {
      padding: var(--tw-space-xs) 10px;
      border: 0;
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-high);
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      cursor: pointer;
    }
    .tab[aria-pressed="true"] {
      background: var(--tw-primary-container);
      color: var(--tw-on-primary-container);
    }
    .results {
      order: 2;
      flex: 1 1 auto;
      overflow-y: auto;
      padding-bottom: var(--tw-space-sm);
    }
    /* Empty, the box is just the search bar and its hint; it grows to the
       full panel once there is anything to show. */
    .box.idle {
      bottom: auto;
    }
    .box.idle .results {
      display: none;
    }
    li:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: -2px;
    }
    .group {
      display: flex;
      justify-content: space-between;
      padding: var(--tw-space-md) var(--tw-space-lg) var(--tw-space-xs);
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      text-transform: uppercase;
    }
    .group .hint {
      text-transform: none;
      letter-spacing: 0;
      font-weight: var(--tw-typo-body-sm-font-weight);
    }
    ul {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--tw-space-sm);
      margin: 0;
      padding: var(--tw-space-xs) var(--tw-space-lg) var(--tw-space-sm);
      list-style: none;
    }
    li {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-xs);
      padding: 10px var(--tw-space-md);
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-high);
      cursor: pointer;
    }
    li[aria-selected="true"] {
      background: var(--tw-primary-container);
      border-color: var(--tw-primary);
      color: var(--tw-on-primary-container);
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
    li[aria-selected="true"] .meta {
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
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      white-space: nowrap;
    }
    li[aria-selected="true"] .badge {
      background: var(--tw-primary);
      color: var(--tw-on-primary);
    }
    .year {
      padding: 1px var(--tw-space-sm);
      border: 1px dashed var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
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
    li[aria-selected="true"] .actions,
    li:hover .actions,
    li:focus-within .actions {
      opacity: 1;
    }
    .share {
      display: inline-flex;
      align-items: center;
      gap: var(--tw-space-xs);
      padding: 2px var(--tw-space-sm);
      border: 1px solid currentColor;
      border-radius: var(--tw-rounded-sm);
      background: none;
      color: inherit;
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      cursor: pointer;
    }
    .share:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 2px;
    }
    footer {
      order: 3;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 2px var(--tw-space-md);
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

  // Closing lets the tray's own filters go, and searches again so the
  // list is right when the box reopens; the words keep what they said.
  hide(): void {
    this.open = false;
    this.trayOpen = false;
    if (filtersOf(this.#controls(), this.trayState).length > 0) {
      this.trayState = {};
      void this.#search(performance.now());
    }
  }

  toggle(): void {
    if (this.open) {
      this.hide();
    } else {
      this.show();
    }
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("system") || changed.has("taxonomy")) {
      this.#derived = deriveTaxonomy(this.system);
    }
    if (
      changed.has("hits") ||
      changed.has("filter") ||
      changed.has("taxonomy") ||
      changed.has("system")
    ) {
      const groups = groupHits(this.hits, this.#tax());
      // A tab that no longer matches anything falls back to all, unless
      // nothing matched at all: then the tab and its tray stay, so a
      // filter that emptied the list can be undone where it was made.
      if (
        this.filter !== undefined &&
        this.hits.length > 0 &&
        !groups.some((group) => group.category === this.filter)
      ) {
        this.filter = undefined;
      }
      this.#groups =
        this.filter === undefined
          ? groups
          : groups.filter((group) => group.category === this.filter);
      this.#visible = this.#groups.flatMap((group) => group.hits);
      if (this.selected >= this.#visible.length) {
        this.selected = 0;
      }
    }
  }

  protected override render() {
    const all = groupHits(this.hits, this.#tax());
    const controls = this.#controls();
    const tabs =
      this.filter !== undefined && !all.some((group) => group.category === this.filter)
        ? [...all, { category: this.filter, hits: [] }]
        : all;
    let offset = 0;
    return html`
      <div
        class="scrim"
        @click=${this.hide}
        @dragover=${this.#onDragOver}
        @drop=${this.#onDrop}
      ></div>
      <div
        class="box ${this.status === "idle" ? "idle" : ""}"
        role="dialog"
        aria-label="Search the compendium"
      >
        <div class="field">
          <input
            type="text"
            .value=${this.query}
            placeholder=${this.placeholder}
            autocomplete="off"
            spellcheck="false"
            aria-controls="hits"
            aria-activedescendant=${this.#visible.length === 0 ? nothing : `hit-${this.selected}`}
            @input=${this.#onInput}
            @scroll=${this.#syncMask}
            @keydown=${this.#onKeydown}
          />
          <div class="mask" aria-hidden="true">${this.#renderMask()}</div>
        </div>
        <div class="results" id="hits" role="listbox">
          ${this.#renderTray(controls)}
          ${this.#groups.map((group, groupIndex) => {
            const start = offset;
            offset += group.hits.length;
            return html`
              <div class="group">
                <span>${group.category}</span>
                ${groupIndex === 0 ? html`<span class="hint">top hit</span>` : nothing}
              </div>
              <ul>
                ${group.hits.map((hit, index) => this.#renderTile(hit, start + index))}
              </ul>
            `;
          })}
        </div>
        <!-- The tabs sit above the results on screen but after them in the
             tab order, so Tab from the input reaches the selected tile first. -->
        <div class="tabs">
          ${
            this.hits.length === 0 && this.filter === undefined
              ? nothing
              : html`
                  <button
                    type="button"
                    class="tab"
                    aria-pressed=${this.filter === undefined ? "true" : "false"}
                    @click=${() => this.#setFilter(undefined)}
                  >
                    All ${this.hits.length}
                  </button>
                  ${tabs.map(
                    (group) => html`
                      <button
                        type="button"
                        class="tab"
                        aria-pressed=${this.filter === group.category ? "true" : "false"}
                        @click=${() => this.#setFilter(group.category)}
                      >
                        ${group.category} ${group.hits.length}
                      </button>
                    `
                  )}
                  ${
                    controls.length === 0
                      ? nothing
                      : html`
                          <button
                            type="button"
                            class="tab funnel"
                            aria-label="Filters"
                            aria-pressed=${this.trayOpen ? "true" : "false"}
                            @click=${this.#toggleTray}
                          >
                            ${FUNNEL_ICON} ${this.#filterCount(controls)}
                          </button>
                        `
                  }
                `
          }
        </div>
        <footer data-status=${this.status}>
          <span>${this.#readout()}</span>
          ${this.#visible.length > 0 ? html`<span>drag a tile out to share</span>` : nothing}
        </footer>
      </div>
    `;
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has("query") || changed.has("understood")) {
      this.#syncMask();
    }
    if (
      changed.has("selected") ||
      changed.has("hits") ||
      changed.has("filter") ||
      changed.has("taxonomy") ||
      changed.has("system")
    ) {
      const tile = this.renderRoot.querySelector<HTMLElement>(`#hit-${this.selected}`);
      tile?.scrollIntoView({ block: "nearest" });
      // Focus follows the selection only when it was already on a tile.
      if (this.#focusTile) {
        this.#focusTile = false;
        tile?.focus();
      }
    }
  }

  // Every tile is a tab stop with its Share button right after it, so Tab
  // walks tile, share, tile, share. Focus on a tile selects it; the arrows
  // move selection and focus together.
  // The mask's text is the query itself, cut at the spans the parser
  // reported: understood words underlined, overruled words greyed, the
  // rest plain. Offsets are in chars, as the core counts them.
  #renderMask() {
    const chars = Array.from(this.query);
    const spans = this.understood
      .filter((item) => item.filter !== null)
      .sort((a, b) => a.start - b.start);
    const parts = [];
    let at = 0;
    for (const span of spans) {
      if (span.start < at || span.end > chars.length) {
        continue;
      }
      parts.push(chars.slice(at, span.start).join(""));
      const text = chars.slice(span.start, span.end).join("");
      parts.push(
        span.overruled === true ? html`<span class="masked">${text}</span>` : html`<u>${text}</u>`
      );
      at = span.end;
    }
    parts.push(chars.slice(at).join(""));
    return parts;
  }

  #syncMask = (): void => {
    const input = this.#input();
    const mask = this.renderRoot.querySelector<HTMLElement>(".mask");
    if (input !== null && mask !== null) {
      mask.scrollLeft = input.scrollLeft;
    }
  };

  #tax(): Taxonomy | undefined {
    return this.taxonomy ?? this.#derived;
  }

  // The tray's controls: those the manifest declares for every kind of the
  // active category, each control once, in manifest order.
  #controls(): ControlSpec[] {
    const system = this.system;
    if (system === undefined || this.filter === undefined) {
      return [];
    }
    const controls: ControlSpec[] = [];
    const seen = new Set<string>();
    for (const [kind, declared] of Object.entries(system.controls ?? {})) {
      if (categoryOf(kind, this.#tax()) !== this.filter) {
        continue;
      }
      for (const control of declared) {
        const key = `${control.control}:${control.facet ?? ""}:${control.label}`;
        if (!seen.has(key)) {
          seen.add(key);
          controls.push(control);
        }
      }
    }
    return controls;
  }

  #filterCount(controls: ControlSpec[]): number {
    const own = filtersOf(controls, this.trayState).length;
    const said = this.understood.filter(
      (item) => item.filter !== null && item.filter.filter !== "kind" && item.overruled !== true
    ).length;
    return own + said;
  }

  // The tray, or a fold of it: when the tray is shut but the words or its
  // own state filter, only what is chosen shows, until the funnel or a
  // click on the fold unfolds it.
  #renderTray(controls: ControlSpec[]) {
    if (controls.length === 0) {
      return nothing;
    }
    const selection = selectionOf(controls, this.understood);
    const active = filtersOf(controls, this.trayState).length > 0 || activeCount(selection) > 0;
    if (!this.trayOpen && !active) {
      return nothing;
    }
    return html`<tw-filter-tray
      ?compact=${!this.trayOpen}
      .label=${this.filter ?? ""}
      .controls=${controls}
      .values=${this.facetValues}
      .state=${this.trayState}
      .selection=${selection}
      @tw-filter=${this.#onTrayFilter}
      @tw-expand=${this.#unfoldTray}
      @keydown=${this.#onTrayKeydown}
    ></tw-filter-tray>`;
  }

  #unfoldTray = (): void => {
    this.trayOpen = true;
  };

  #toggleTray = (): void => {
    this.trayOpen = !this.trayOpen;
  };

  // The words lead: a kind noun lights its category's tab, and a filter
  // read from the text shows in the tray, folded until the funnel unfolds
  // it. Neither closes anything.
  #followWords(): void {
    const said = this.understood.filter((item) => item.filter !== null && item.overruled !== true);
    const categories = new Set(
      said.flatMap((item) => kindsNamed(item.filter)).map((kind) => categoryOf(kind, this.#tax()))
    );
    if (categories.size === 1) {
      const [category] = categories;
      if (category !== undefined && category !== this.filter) {
        this.filter = category;
        this.trayState = {};
      }
    }
    // Words that narrow the answer to one category light its tab too,
    // so the tray can show what they chose; plain words never move it.
    if (this.filter === undefined && said.length > 0 && this.hits.length > 0) {
      const found = new Set(this.hits.map((hit) => categoryOf(hit.type, this.#tax())));
      if (found.size === 1) {
        const [only] = found;
        this.filter = only;
      }
    }
  }

  #onTrayFilter = (event: Event): void => {
    this.trayState = (event as CustomEvent<TrayState>).detail;
    void this.#search(performance.now());
  };

  // Escape in the tray returns to the input; the host's Escape cascade
  // leaves it to the tray while focus is there.
  #onTrayKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.#input()?.focus();
    }
  };

  #renderTile(hit: SpotlightHit, index: number) {
    const preview = previewOf(hit, this.#tax());
    const selected = index === this.selected;
    return html`
      <li
        id=${`hit-${index}`}
        role="option"
        aria-selected=${selected ? "true" : "false"}
        tabindex="0"
        draggable="true"
        @pointermove=${() => this.#select(index)}
        @focusin=${() => this.#select(index)}
        @click=${() => {
          this.#select(index);
          this.#choose(index);
        }}
        @keydown=${this.#onTileKeydown}
        @dragstart=${(event: DragEvent) => this.#onDragStart(event, hit)}
        @dragend=${this.#onDragEnd}
      >
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
              @click=${(event: Event) => {
                event.stopPropagation();
                this.#share(hit);
              }}
            >
              ${SHARE_ICON} Share
            </button>
          </span>
        </span>
      </li>
    `;
  }

  // A hit of another version than the viewer reads is standing in for a
  // thing their version lacks.
  #standsIn(hit: SpotlightHit): boolean {
    const version = hit.version ?? "";
    return version !== "" && this.version !== "" && version !== this.version;
  }

  #readout(): string {
    switch (this.status) {
      case "idle":
        return "Type to search. Try evocation spells below level 3, or creatures cr 5+.";
      case "error":
        return this.message;
      case "searching":
      case "done": {
        const count =
          this.hits.length === 0
            ? "No matches"
            : `${this.hits.length} ${this.hits.length === 1 ? "hit" : "hits"}`;
        const core = (this.elapsedUs / 1000).toFixed(2);
        const paint = this.paintMs.toFixed(0);
        return `${count} of ${this.catalogueSize}, core ${core} ms, to paint ${paint} ms`;
      }
    }
  }

  #input(): HTMLInputElement | null {
    return this.renderRoot.querySelector("input");
  }

  // A tab is a view; the tray's own state belongs to the tab it was made
  // on, so changing tabs lets it go and searches again without it.
  #setFilter(category: string | undefined): void {
    const had = filtersOf(this.#controls(), this.trayState).length > 0;
    this.filter = category;
    this.selected = 0;
    this.trayState = {};
    if (category === undefined) {
      this.trayOpen = false;
    }
    this.#input()?.focus();
    if (had) {
      void this.#search(performance.now());
    }
  }

  #onInput = (event: Event): void => {
    this.query = (event.target as HTMLInputElement).value;
    void this.#search(performance.now());
  };

  #onKeydown = (event: KeyboardEvent): void => {
    this.#navigate(event, false);
  };

  #onTileKeydown = (event: KeyboardEvent): void => {
    // Space activates a focused tile, as it does a button.
    if (event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      this.#choose(this.selected);
      return;
    }
    this.#navigate(event, true);
  };

  // The keys the box answers, from the input or from a tile. Keys it handles
  // are its own; nothing behind it may act on them.
  #navigate(event: KeyboardEvent, fromTile: boolean): void {
    if (HANDLED_KEYS.has(event.key)) {
      event.stopPropagation();
    }
    switch (event.key) {
      case "Tab":
        // From the input, Tab lands on the selected tile rather than the
        // first; from there the native order takes over.
        if (!fromTile && !event.shiftKey && this.#visible.length > 0) {
          event.preventDefault();
          this.renderRoot.querySelector<HTMLElement>(`#hit-${this.selected}`)?.focus();
        }
        break;
      case "ArrowDown":
        event.preventDefault();
        this.#focusTile = fromTile;
        this.#select(this.#step(1));
        break;
      case "ArrowUp":
        event.preventDefault();
        this.#focusTile = fromTile;
        this.#select(this.#step(-1));
        break;
      case "Home":
      case "End":
        // In the input these move the caret, as in any text field; on a
        // tile they jump to the first or the last tile.
        if (!fromTile) {
          break;
        }
        event.preventDefault();
        this.#focusTile = true;
        this.#select(event.key === "Home" ? 0 : this.#visible.length - 1);
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
  }

  // Wraps at both ends, as Spotlight does.
  #step(delta: number): number {
    const count = this.#visible.length;
    if (count === 0) {
      return 0;
    }
    return (this.selected + delta + count) % count;
  }

  #select(index: number): void {
    if (index >= 0 && index < this.#visible.length) {
      this.selected = index;
    }
  }

  // Choosing opens the entry and leaves the box open: reading through a
  // compendium is many choices in a row. Escape closes the box.
  #choose(index: number): void {
    const hit = this.#visible[index];
    if (hit === undefined) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<SpotlightHit>("tw-select", { detail: hit, bubbles: true, composed: true })
    );
  }

  #share(hit: SpotlightHit): void {
    this.dispatchEvent(
      new CustomEvent<SpotlightHit>("tw-share", { detail: hit, bubbles: true, composed: true })
    );
    // Sharing is a side act; typing and the arrows carry on from the input.
    this.#input()?.focus();
  }

  // A tile dragged onto the scrim, which is everything outside the box, is
  // a share; the pointer never has to find a drop target.
  #onDragStart(event: DragEvent, hit: SpotlightHit): void {
    this.#dragging = hit;
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", hit.name);
      event.dataTransfer.setData("application/x-tablewright-entry", hit.id);
    }
  }

  #onDragEnd = (): void => {
    this.#dragging = undefined;
  };

  #onDragOver = (event: DragEvent): void => {
    if (this.#dragging !== undefined) {
      event.preventDefault();
      if (event.dataTransfer !== null) {
        event.dataTransfer.dropEffect = "copy";
      }
    }
  };

  #onDrop = (event: DragEvent): void => {
    const hit = this.#dragging;
    this.#dragging = undefined;
    if (hit === undefined) {
      return;
    }
    event.preventDefault();
    this.#share(hit);
  };

  // One search per keystroke, no debounce: the core answers in well under a
  // millisecond, and a debounce would only add latency. Latest wins.
  async #search(startedAt: number): Promise<void> {
    const sequence = ++this.#sequence;
    const query = this.query;
    const filters = filtersOf(this.#controls(), this.trayState);
    if (query.trim() === "" && filters.length === 0) {
      this.hits = [];
      this.understood = [];
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
      answer = await this.searcher(query, filters);
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
    this.understood = answer.understood ?? [];
    this.selected = 0;
    this.elapsedUs = answer.elapsedUs;
    this.catalogueSize = answer.catalogueSize;
    this.status = "done";
    this.#followWords();
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

// Kind to category label, from a system manifest.
function deriveTaxonomy(system: SystemManifest | undefined): Taxonomy | undefined {
  if (system === undefined) {
    return undefined;
  }
  const taxonomy: Record<string, string> = {};
  for (const [kind, spec] of Object.entries(system.kinds ?? {})) {
    taxonomy[kind] = system.categories?.[spec.category] ?? spec.name;
  }
  return taxonomy;
}

// The kinds a filter names outright.
function kindsNamed(filter: Understood["filter"]): string[] {
  if (filter === null) {
    return [];
  }
  switch (filter.filter) {
    case "kind":
      return [filter.value];
    case "any":
      return filter.items.flatMap((item) => kindsNamed(item));
    default:
      return [];
  }
}

customElements.define("tw-spotlight", TwSpotlight);

declare global {
  interface HTMLElementTagNameMap {
    "tw-spotlight": TwSpotlight;
  }
}
