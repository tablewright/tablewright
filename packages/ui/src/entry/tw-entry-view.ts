// A compendium entry as a page: the paper leaf the desk turns to
// (design.md §3, §4), reduced to what every entry has: a label line, the
// title, the body, tags, and where it came from. The per-system layout
// (a spell's casting gauge, a creature's statblock) comes with typed
// system data. Tauri-agnostic: the host loads the entry and hands it in.
//
// Events: `tw-close` when the page is closed.

import { LitElement, css, html, nothing } from "lit";
import { previewOf } from "../spotlight/preview.js";
import { paragraphs, runs } from "./markdown-lite.js";

/** What the page shows: the envelope without the system data. */
export interface EntryDocument {
  id: string;
  type: string;
  name: string;
  source: string;
  tags: string[];
  body: string;
}

export class TwEntryView extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    entry: { attribute: false },
  };

  declare open: boolean;
  declare entry: EntryDocument | undefined;

  constructor() {
    super();
    this.open = false;
    this.entry = undefined;
  }

  static override styles = css`
    :host {
      position: fixed;
      top: var(--tw-space-lg);
      right: var(--tw-space-lg);
      bottom: var(--tw-space-lg);
      z-index: 90;
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
    p {
      margin: 0;
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
  `;

  /** Show `entry` and take focus, so Escape closes it. */
  show(entry: EntryDocument): void {
    this.entry = entry;
    this.open = true;
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector("button")?.focus();
    });
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
        <button type="button" @click=${this.hide}>Close</button>
      </header>
      <article>
        ${paragraphs(entry.body).map(
          (paragraph) =>
            html`<p>
              ${runs(paragraph).map((run) =>
                run.bold ? html`<strong>${run.text}</strong>` : run.text
              )}
            </p>`
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
        <span>${entry.source}</span>
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
}

customElements.define("tw-entry-view", TwEntryView);

declare global {
  interface HTMLElementTagNameMap {
    "tw-entry-view": TwEntryView;
  }
}
