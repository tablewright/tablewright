// A compendium entry as a page: the paper leaf the desk turns to
// (design.md §3, §4), reduced to what every entry has: a label line, the
// title, the body, tags, and where it came from. The per-system layout
// (a spell's casting gauge, a creature's statblock) comes with typed
// system data. Tauri-agnostic: the host loads the entry and hands it in.
//
// Events: `tw-close` when the page is closed; `tw-place` (detail: the
// entry) when a creature's Place on board button is pressed; `tw-version`
// (detail: { id, version }) when the footer's rail asks for the same thing
// in another rule version. The switch is the page's own, per thing: a
// personal version waits for character sheets (design.md §3).

import { LitElement, css, html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { Section, Visibility } from "@tablewright/schema";
import { previewOf } from "../spotlight/preview.js";
import { groups } from "./sections.js";

/** What the page shows: the envelope without the system data. */
export interface EntryDocument {
  id: string;
  type: string;
  name: string;
  source: string;
  tags: string[];
  /** The rule version this entry is: "2014", "2024"; empty when unversioned. */
  version: string;
  /** Every rule version the same thing exists in, its own among them. */
  versions: string[];
  /** The prose as written, markdown. */
  body: string;
  /**
   * The prose as the core rendered it. Inserted as is: the core's renderer
   * is the only thing that ever writes HTML, and it drops what it did not
   * write itself (design.md §3 "One renderer, two surfaces").
   */
  html: string;
  /**
   * The named parts of the entry's data, each rendered by the core: a
   * creature's traits and actions, a class's features. In the order the
   * system manifest gave them; consecutive labels share a heading.
   */
  sections: Section[];
}

export class TwEntryView extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    entry: { attribute: false },
    versions: { attribute: false },
    viewer: { type: String },
  };

  declare open: boolean;
  declare entry: EntryDocument | undefined;
  /**
   * The rule versions the system comes in, in rail order; the footer offers
   * each, lit for the one shown, dimmed where the thing does not exist.
   */
  declare versions: string[];
  /**
   * Whose page this is: the DM's carries the table's controls (Place on
   * board); a player's does not. The party tier unless the host says.
   */
  declare viewer: Visibility;

  constructor() {
    super();
    this.open = false;
    this.entry = undefined;
    this.versions = [];
    this.viewer = "party";
  }

  static override styles = css`
    :host {
      position: fixed;
      top: var(--tw-space-lg);
      right: var(--tw-space-lg);
      bottom: var(--tw-space-lg);
      /* Above the search box's scrim: the page stays lit while the box is
         open, since reading it is the point of searching. */
      z-index: 150;
      display: flex;
      flex-direction: column;
      width: min(560px, calc(100vw - 2 * var(--tw-space-lg)));
      box-sizing: border-box;
      padding: var(--tw-comp-document-padding);
      gap: var(--tw-space-lg);
      background: var(--tw-comp-document-background-color);
      color: var(--tw-comp-document-text-color);
      font-family: var(--tw-comp-document-font-family);
      font-size: var(--tw-comp-document-font-size);
      line-height: var(--tw-comp-document-line-height);
      border-radius: var(--tw-comp-document-rounded);
      box-shadow: 0 10px 28px rgb(0 0 0 / 0.45);
      overflow: hidden;
    }
    :host(:not([open])) {
      display: none;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--tw-space-lg);
    }
    .actions {
      display: flex;
      gap: var(--tw-space-sm);
      flex-shrink: 0;
    }
    .label {
      color: var(--tw-comp-document-label-text-color);
      font-family: var(--tw-comp-document-label-font-family);
      font-size: var(--tw-comp-document-label-font-size);
      font-weight: var(--tw-comp-document-label-font-weight);
      line-height: var(--tw-comp-document-label-line-height);
      letter-spacing: var(--tw-typo-document-label-letter-spacing);
      text-transform: uppercase;
    }
    h1 {
      margin: var(--tw-space-xs) 0 0;
      color: var(--tw-comp-document-title-text-color);
      font-family: var(--tw-comp-document-title-font-family);
      font-size: var(--tw-comp-document-title-font-size);
      font-weight: var(--tw-comp-document-title-font-weight);
      line-height: var(--tw-comp-document-title-line-height);
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: var(--tw-space-xs);
      padding: var(--tw-space-xs) 10px;
      border: 1px solid var(--tw-ink-faint);
      border-radius: var(--tw-rounded-sm);
      background: none;
      color: var(--tw-ink-soft);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 2px;
    }
    article {
      flex: 1 1 auto;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-md);
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-md);
    }
    .body > * {
      margin: 0;
    }
    .body h2,
    .body h3,
    .body h4 {
      margin-top: var(--tw-space-xs);
      color: var(--tw-ink-soft);
      font-family: var(--tw-typo-document-label-font-family);
      font-size: var(--tw-typo-document-label-font-size);
      font-weight: var(--tw-typo-document-label-font-weight);
      line-height: var(--tw-typo-document-label-line-height);
      letter-spacing: var(--tw-typo-document-label-letter-spacing);
      text-transform: uppercase;
    }
    .body h2 {
      font-size: calc(var(--tw-typo-document-label-font-size) + 1px);
    }
    .body ul,
    .body ol {
      padding-left: var(--tw-space-lg);
    }
    .body li + li {
      margin-top: var(--tw-space-xs);
    }
    .body blockquote {
      padding-left: var(--tw-space-md);
      border-left: 2px solid var(--tw-paper-shade);
      color: var(--tw-ink-soft);
    }
    .body hr {
      height: 0;
      border: 0;
      border-top: 1px solid var(--tw-paper-shade);
    }
    .body a {
      color: inherit;
      text-decoration-color: var(--tw-ink-faint);
    }
    /* A wide table scrolls inside itself; the page never scrolls sideways. */
    .body table {
      display: block;
      max-width: 100%;
      overflow-x: auto;
      border-collapse: collapse;
      font-size: var(--tw-typo-body-sm-font-size);
      line-height: var(--tw-typo-body-sm-line-height);
    }
    .body th,
    .body td {
      padding: var(--tw-space-xs) var(--tw-space-sm);
      border-bottom: 1px solid var(--tw-paper-shade);
      text-align: left;
      vertical-align: top;
    }
    .body th {
      color: var(--tw-ink-soft);
      font-family: var(--tw-typo-document-label-font-family);
      font-size: var(--tw-typo-document-label-font-size);
      font-weight: var(--tw-typo-document-label-font-weight);
      letter-spacing: var(--tw-typo-document-label-letter-spacing);
      text-transform: uppercase;
    }
    .body th[align="center"],
    .body td[align="center"] {
      text-align: center;
    }
    .body th[align="right"],
    .body td[align="right"] {
      text-align: right;
    }
    .parts {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-md);
    }
    .parts h2 {
      margin: var(--tw-space-sm) 0 0;
      padding-bottom: var(--tw-space-xs);
      border-bottom: 1px solid var(--tw-paper-shade);
      color: var(--tw-ink-soft);
      font-family: var(--tw-typo-document-label-font-family);
      font-size: var(--tw-typo-document-label-font-size);
      font-weight: var(--tw-typo-document-label-font-weight);
      line-height: var(--tw-typo-document-label-line-height);
      letter-spacing: var(--tw-typo-document-label-letter-spacing);
      text-transform: uppercase;
    }
    .part {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-xs);
    }
    .part h3 {
      display: flex;
      align-items: baseline;
      gap: var(--tw-space-sm);
      margin: 0;
      color: var(--tw-ink);
      font-family: inherit;
      font-size: inherit;
      font-weight: 600;
      line-height: inherit;
    }
    .part .note {
      color: var(--tw-ink-faint);
      font-family: var(--tw-typo-document-label-font-family);
      font-size: var(--tw-typo-document-label-font-size);
      font-weight: var(--tw-typo-document-label-font-weight);
      letter-spacing: var(--tw-typo-document-label-letter-spacing);
      text-transform: uppercase;
      white-space: nowrap;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag {
      padding: 2px var(--tw-space-sm);
      border: 1px solid var(--tw-paper-shade);
      border-radius: var(--tw-rounded-full);
      color: var(--tw-ink-soft);
      font-size: var(--tw-typo-body-sm-font-size);
      line-height: var(--tw-typo-body-sm-line-height);
    }
    footer {
      display: flex;
      justify-content: space-between;
      gap: var(--tw-space-md);
      padding-top: var(--tw-space-md);
      border-top: 1px solid var(--tw-paper-shade);
      color: var(--tw-ink-faint);
      font-size: var(--tw-typo-document-label-font-size);
      line-height: 1.4;
    }
    footer code {
      font-family: var(--tw-typo-numeric-md-font-family);
      font-size: inherit;
    }
    .versions {
      display: inline-flex;
      border: 1px solid var(--tw-paper-shade);
      border-radius: var(--tw-rounded-sm);
      overflow: hidden;
    }
    .versions button {
      padding: 2px 10px;
      border: 0;
      border-right: 1px solid var(--tw-paper-shade);
      border-radius: 0;
      color: var(--tw-ink-faint);
      font-family: var(--tw-typo-numeric-md-font-family);
      font-variant-numeric: tabular-nums;
    }
    .versions button:last-child {
      border-right: 0;
    }
    .versions button[aria-pressed="true"] {
      background: var(--tw-ink-soft);
      color: var(--tw-paper);
    }
    .versions button:disabled {
      color: var(--tw-paper-shade);
      cursor: default;
    }
  `;

  /** Show `entry`. Focus stays where it was: a reader turning pages from the
   * search box keeps typing there, and the host decides what Escape does. */
  show(entry: EntryDocument): void {
    this.entry = entry;
    this.open = true;
  }

  hide(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.dispatchEvent(new CustomEvent("tw-close", { bubbles: true, composed: true }));
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("keydown", this.#onKeydown);
  }

  override disconnectedCallback(): void {
    this.removeEventListener("keydown", this.#onKeydown);
    super.disconnectedCallback();
  }

  protected override render() {
    const entry = this.entry;
    if (entry === undefined) {
      return nothing;
    }
    const preview = previewOf(entry);
    // "Spell · Cantrip", "Monster · CR 1/4", "Magic Item · Rare": the kind as
    // words, then the one fact the category leads with.
    const kind = entry.type
      .split("-")
      .map((word) => (word.length === 0 ? word : word[0]?.toUpperCase() + word.slice(1)))
      .join(" ");
    const detail =
      preview.ring === "C"
        ? "Cantrip"
        : preview.ring !== undefined
          ? `Level ${preview.ring}`
          : preview.badge;
    const label = detail === undefined ? kind : `${kind} · ${detail}`;
    return html`
      <header>
        <div>
          <div class="label">${label}</div>
          <h1>${entry.name}</h1>
        </div>
        <span class="actions">
          ${
            entry.type === "monster" && this.viewer === "dm"
              ? html`<button type="button" @click=${this.#place}>Place on board</button>`
              : nothing
          }
          <button type="button" @click=${this.hide}>Close</button>
        </span>
      </header>
      <article>
        ${entry.html === "" ? nothing : html`<div class="body">${unsafeHTML(entry.html)}</div>`}
        ${groups(entry.sections).map(
          (group) => html`
            <section class="parts">
              <h2>${group.label}</h2>
              ${group.items.map(
                (section) => html`
                  <div class="part">
                    <h3>
                      ${section.name}
                      ${section.note === "" ? nothing : html`<span class="note">${section.note}</span>`}
                    </h3>
                    ${
                      section.html === ""
                        ? nothing
                        : html`<div class="body">${unsafeHTML(section.html)}</div>`
                    }
                  </div>
                `
              )}
            </section>
          `
        )}
        ${
          entry.tags.length === 0
            ? nothing
            : html`<div class="tags">
                ${entry.tags.map((tag) => html`<span class="tag">${tag}</span>`)}
              </div>`
        }
      </article>
      <footer>
        ${
          this.versions.length > 1
            ? html`<span class="versions" role="group" aria-label="Rule version">
                ${this.versions.map((version) => {
                  const here = entry.versions.includes(version);
                  return html`<button
                    type="button"
                    aria-pressed=${version === entry.version}
                    ?disabled=${!here}
                    title=${here ? `The ${version} rules` : `Not in the ${version} rules`}
                    @click=${() => this.#turnTo(version)}
                  >
                    ${version}
                  </button>`;
                })}
              </span>`
            : html`<span>${entry.source}</span>`
        }
        <code>${entry.id}</code>
      </footer>
    `;
  }

  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.hide();
    }
  };

  // A creature can stand on the board; the host decides where.
  #turnTo(version: string): void {
    if (this.entry === undefined || version === this.entry.version) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("tw-version", {
        detail: { id: this.entry.id, version },
        bubbles: true,
        composed: true,
      })
    );
  }

  #place = (): void => {
    if (this.entry !== undefined) {
      this.dispatchEvent(
        new CustomEvent<EntryDocument>("tw-place", {
          detail: this.entry,
          bubbles: true,
          composed: true,
        })
      );
    }
  };
}

customElements.define("tw-entry-view", TwEntryView);

declare global {
  interface HTMLElementTagNameMap {
    "tw-entry-view": TwEntryView;
  }
}
