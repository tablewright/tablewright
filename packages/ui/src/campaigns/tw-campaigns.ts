// The intro: the campaigns the app knows, to bring one to the table, make
// a new one, or open a folder the DM keeps elsewhere. Shown until a
// campaign is open, and again when the DM leaves one. Like Foundry's setup
// screen, it is the whole window, not a panel over the board.
//
// `tw-campaign-open` carries the path to open; `tw-campaign-create` the
// name of the new campaign and whether it goes in a folder of the DM's own
// (the app asks where); `tw-campaign-browse` asks the app for a folder to
// open. Choosing a folder is the app's, since only the desktop shell has a
// dialog for it.

import { LitElement, css, html } from "lit";
import type { CampaignSummary } from "@tablewright/schema";

export class TwCampaigns extends LitElement {
  static override properties = {
    campaigns: { attribute: false },
  };

  /** Every campaign the app knows, by name. */
  declare campaigns: CampaignSummary[];

  constructor() {
    super();
    this.campaigns = [];
  }

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: grid;
      place-items: center;
      overflow: auto;
      background: var(--tw-background);
      color: var(--tw-on-background);
    }
    :host([hidden]) {
      display: none;
    }
    .intro {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-lg);
      width: min(560px, calc(100% - 2 * var(--tw-space-xl)));
      padding: var(--tw-space-xl) 0;
    }
    h1 {
      margin: 0;
      font-family: var(--tw-typo-headline-md-font-family);
      font-size: var(--tw-typo-headline-md-font-size);
      font-weight: var(--tw-typo-headline-md-font-weight);
      line-height: var(--tw-typo-headline-md-line-height);
    }
    .lede,
    .hint,
    .empty {
      margin: 0;
      color: var(--tw-on-surface-variant);
    }
    .hint {
      flex: 1;
      min-width: 12em;
      font-family: var(--tw-typo-body-sm-font-family);
      font-size: var(--tw-typo-body-sm-font-size);
      font-weight: var(--tw-typo-body-sm-font-weight);
      line-height: var(--tw-typo-body-sm-line-height);
    }
    h2 {
      margin: 0 0 var(--tw-space-sm);
      color: var(--tw-comp-panel-title-text-color);
      font-family: var(--tw-comp-panel-title-font-family);
      font-size: var(--tw-comp-panel-title-font-size);
      font-weight: var(--tw-comp-panel-title-font-weight);
      line-height: var(--tw-comp-panel-title-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      text-transform: uppercase;
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-xs);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--tw-space-md);
      padding: var(--tw-space-sm) var(--tw-space-md);
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-comp-panel-rounded);
      background: var(--tw-comp-panel-background-color);
      color: var(--tw-comp-panel-text-color);
    }
    .about {
      flex: 1;
      min-width: 0;
    }
    .name {
      display: block;
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
    }
    .meta {
      display: block;
      overflow-wrap: anywhere;
      color: var(--tw-on-surface-variant);
      font-family: var(--tw-typo-body-sm-font-family);
      font-size: var(--tw-typo-body-sm-font-size);
      font-weight: var(--tw-typo-body-sm-font-weight);
      line-height: var(--tw-typo-body-sm-line-height);
    }
    .empty {
      padding: var(--tw-space-md);
      border: 1px dashed var(--tw-outline-variant);
      border-radius: var(--tw-comp-panel-rounded);
    }
    form {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tw-space-xs);
    }
    input {
      flex: 1;
      min-width: 12em;
      padding: var(--tw-comp-input-padding);
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-input-rounded);
      background: var(--tw-comp-input-background-color);
      color: var(--tw-comp-input-text-color);
      font-family: var(--tw-comp-input-font-family);
      font-size: var(--tw-comp-input-font-size);
      font-weight: var(--tw-comp-input-font-weight);
      line-height: var(--tw-comp-input-line-height);
    }
    button {
      padding: var(--tw-comp-button-quiet-padding) var(--tw-space-md);
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-button-quiet-rounded);
      background: var(--tw-comp-button-quiet-background-color);
      color: var(--tw-comp-button-quiet-text-color);
      font-family: var(--tw-comp-button-quiet-font-family);
      font-size: var(--tw-comp-button-quiet-font-size);
      font-weight: var(--tw-comp-button-quiet-font-weight);
      line-height: var(--tw-comp-button-quiet-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
      white-space: nowrap;
      cursor: pointer;
    }
    button:hover {
      background: var(--tw-surface-container-highest);
    }
    button.primary {
      padding: var(--tw-comp-button-primary-padding);
      border-color: transparent;
      border-radius: var(--tw-comp-button-primary-rounded);
      background: var(--tw-comp-button-primary-background-color);
      color: var(--tw-comp-button-primary-text-color);
      font-family: var(--tw-comp-button-primary-font-family);
      font-size: var(--tw-comp-button-primary-font-size);
      font-weight: var(--tw-comp-button-primary-font-weight);
      line-height: var(--tw-comp-button-primary-line-height);
    }
    button.primary:hover {
      background: var(--tw-comp-button-primary-hover-background-color);
    }
    .elsewhere {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--tw-space-sm);
      margin-top: var(--tw-space-sm);
    }
    :focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 2px;
    }
  `;

  override render() {
    return html`
      <div class="intro">
        <header>
          <h1>Tablewright</h1>
          <p class="lede">Choose a campaign to bring to the table.</p>
        </header>
        <section aria-labelledby="campaigns-heading">
          <h2 id="campaigns-heading">Campaigns</h2>
          ${
            this.campaigns.length === 0
              ? html`<p class="empty">No campaigns yet. Make the first one below.</p>`
              : html`<ul>
                  ${this.campaigns.map(
                    (campaign) => html`<li>
                      <span class="about">
                        <span class="name">${campaign.name}</span>
                        <span class="meta">${campaign.system} — ${campaign.version}</span>
                        <span class="meta">${campaign.path}</span>
                      </span>
                      <button
                        type="button"
                        class="primary"
                        aria-label="Open ${campaign.name}"
                        @click=${() => this.#open(campaign.path)}
                      >
                        Open
                      </button>
                    </li>`
                  )}
                </ul>`
          }
        </section>
        <section aria-labelledby="new-heading">
          <h2 id="new-heading">New campaign</h2>
          <form @submit=${this.#create}>
            <input
              name="name"
              placeholder="Campaign name"
              aria-label="New campaign name"
              autocomplete="off"
              required
            />
            <button type="submit" class="primary">Create</button>
          </form>
          <div class="elsewhere">
            <p class="hint">
              Kept in your Tablewright folder, unless you choose a folder of your own.
            </p>
            <button type="button" @click=${this.#createElsewhere}>Create in a folder…</button>
          </div>
        </section>
        <section aria-labelledby="folder-heading">
          <h2 id="folder-heading">Elsewhere</h2>
          <div class="elsewhere">
            <p class="hint">
              A campaign folder copied from another machine, or kept on a drive of its own.
            </p>
            <button type="button" @click=${this.#browse}>Open a folder…</button>
          </div>
        </section>
      </div>
    `;
  }

  #open(path: string): void {
    this.dispatchEvent(
      new CustomEvent("tw-campaign-open", { detail: { path }, bubbles: true, composed: true })
    );
  }

  #create = (event: Event): void => {
    event.preventDefault();
    const name = this.#nameOf(event.currentTarget);
    if (name !== undefined) {
      this.#dispatchCreate(name, false);
    }
  };

  // The name is the form's; where it goes is asked by the app once the
  // event lands, since the intro has no dialog of its own.
  #createElsewhere = (): void => {
    const form = this.renderRoot.querySelector("form");
    if (form === null || !form.reportValidity()) {
      return;
    }
    const name = this.#nameOf(form);
    if (name !== undefined) {
      this.#dispatchCreate(name, true);
    }
  };

  #dispatchCreate(name: string, elsewhere: boolean): void {
    this.dispatchEvent(
      new CustomEvent("tw-campaign-create", {
        detail: { name, elsewhere },
        bubbles: true,
        composed: true,
      })
    );
  }

  #browse = (): void => {
    this.dispatchEvent(new CustomEvent("tw-campaign-browse", { bubbles: true, composed: true }));
  };

  #nameOf(form: EventTarget | null): string | undefined {
    if (!(form instanceof HTMLFormElement)) {
      return undefined;
    }
    const name = new FormData(form).get("name");
    return typeof name === "string" && name.trim() !== "" ? name.trim() : undefined;
  }
}

customElements.define("tw-campaigns", TwCampaigns);

declare global {
  interface HTMLElementTagNameMap {
    "tw-campaigns": TwCampaigns;
  }
}
