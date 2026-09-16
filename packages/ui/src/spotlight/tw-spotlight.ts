/**
 * ─ Spotlight ─
 *
 * The search box: one input pinned to the left edge, the rest of the screen
 * dimmed, hits as tiles two per row grouped by category, groups ordered by
 * their best hit. It is mounted once and hidden, so opening is one attribute
 * flipped; an answer that lands after a newer keystroke is dropped, so the
 * latest wins.
 * Design: docs/design.md §3
 */

import { LitElement, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import type { ControlSpec, SystemManifest, Understood } from "@tablewright/schema";
import "../filters/tw-filter-tray.js";
import "./tw-hit-tile.js";
import { activeCount, filtersOf, selectionOf } from "../filters/state.js";
import type { TrayState } from "../filters/state.js";
import { answerKey } from "./keys.js";
import { categoryOf, groupHits } from "./preview.js";
import type { Taxonomy } from "./preview.js";
import type { HitGroup } from "./preview.js";
import type { SearchAnswer, Searcher, SpotlightHit } from "./searcher.js";
import { SPOTLIGHT_STYLES } from "./styles.js";
import { emit } from "../events.js";
import { FILTER_ICON } from "../icons.js";

type Status = "idle" | "searching" | "done" | "error";

// The list is derived from these; a change to any of them redraws it.
const LIST_KEYS = ["hits", "filter", "taxonomy", "system"] as const;

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
  // Derived from hits and filter once per update, not per render call: every
  // group, those the tab in force keeps, and their hits in order.
  #all: HitGroup[] = [];
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

  static override styles = SPOTLIGHT_STYLES;

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
    // A closed box holds no focus: the table's keys work at once, not
    // once the browser has painted and noticed the field is gone.
    const focused = this.shadowRoot?.activeElement;
    if (focused instanceof HTMLElement) {
      focused.blur();
    }
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
    if (this.#listChanged(changed)) {
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
      this.#all = groups;
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

  #listChanged(changed: PropertyValues<this>): boolean {
    return LIST_KEYS.some((key) => changed.has(key));
  }

  protected override render() {
    const all = this.#all;
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
                            ${FILTER_ICON} ${this.#filterCount(controls)}
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
    if (changed.has("selected") || this.#listChanged(changed)) {
      const tile = this.#tileAt(this.selected);
      tile?.scrollIntoView({ block: "nearest" });
      // Focus follows the selection only when it was already on a tile.
      if (this.#focusTile) {
        this.#focusTile = false;
        tile?.focus();
      }
    }
  }

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

  // The words lead: a kind noun lights its category's tab, and a filter read
  // from the text shows in the tray, folded until the funnel unfolds it.
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

  #onTrayFilter = (event: HTMLElementEventMap["tw-filter"]): void => {
    this.trayState = event.detail;
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

  // Every tile is a tab stop with its Share button right after it, so Tab
  // walks tile, share, tile, share. Focus on a tile selects it; the arrows
  // move selection and focus together.
  #renderTile(hit: SpotlightHit, index: number) {
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
        <tw-hit-tile
          .hit=${hit}
          .taxonomy=${this.#tax()}
          .version=${this.version}
          ?selected=${selected}
          @tw-share=${this.#onTileShare}
        ></tw-hit-tile>
      </li>
    `;
  }

  // The tile's own event ends here; the box raises the one the host hears,
  // as it does for a drop.
  #onTileShare = (event: HTMLElementEventMap["tw-share"]): void => {
    event.stopPropagation();
    this.#share(event.detail);
  };

  #tileAt(index: number): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`#hit-${index}`);
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
    this.#answer(event, false);
  };

  #onTileKeydown = (event: KeyboardEvent): void => {
    this.#answer(event, true);
  };

  // The keys the box answers, from the input or from a tile. Keys it keeps
  // are its own; nothing behind it may act on them.
  #answer(event: KeyboardEvent, fromTile: boolean): void {
    const answer = answerKey(
      { key: event.key, shift: event.shiftKey },
      { count: this.#visible.length, selected: this.selected, fromTile }
    );
    if (answer.own) {
      event.stopPropagation();
    }
    if (answer.effect === "none") {
      return;
    }
    event.preventDefault();
    switch (answer.effect) {
      case "select":
        this.#focusTile = answer.focus;
        this.#select(answer.index);
        break;
      case "focus":
        this.#tileAt(this.selected)?.focus();
        break;
      case "choose":
        this.#choose(this.selected);
        break;
      case "close":
        this.hide();
        break;
    }
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
    emit(this, "tw-select", hit);
  }

  // The host turns the hit into a card for the table.
  #share(hit: SpotlightHit): void {
    emit(this, "tw-share", hit);
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
    // Measured at DOM commit so the number is this keystroke's; the next
    // frame refines it to the paint.
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
  interface HTMLElementEventMap {
    "tw-select": CustomEvent<SpotlightHit>;
    "tw-share": CustomEvent<SpotlightHit>;
  }
}
