/**
 * ─ Campaigns ─
 *
 * The intro: the campaigns the app knows, to bring one to the table, make
 * a new one, or open a folder the DM keeps elsewhere. Shown until a
 * campaign is open, and again when the DM leaves one. Like Foundry's setup
 * screen, it is the whole window, not a panel over the board.
 */

import { LitElement, css, html } from "lit";
import type { CampaignSummary } from "@tablewright/schema";
import { emit } from "../../utils/events.js";
import { FOCUS_RING, QUIET_BUTTON, QUIET_BUTTON_HOVER } from "../../atoms/styles.js";
import { nameFrom } from "../../utils/text.js";

export class TwCampaigns extends LitElement {
  static override properties = {
    campaigns: { attribute: false },
  };

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
      font: var(--tw-typo-headline-md-font);
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
      font: var(--tw-typo-body-sm-font);
    }
    h2 {
      margin: 0 0 var(--tw-space-sm);
      color: var(--tw-comp-panel-title-text-color);
      font: var(--tw-comp-panel-title-font);
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
      font: var(--tw-typo-label-md-font);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
    }
    .meta {
      display: block;
      overflow-wrap: anywhere;
      color: var(--tw-on-surface-variant);
      font: var(--tw-typo-body-sm-font);
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
      font: var(--tw-comp-input-font);
    }
    button {
      ${QUIET_BUTTON}
      white-space: nowrap;
    }
    button:hover {
      ${QUIET_BUTTON_HOVER}
    }
    button.primary {
      padding: var(--tw-comp-button-primary-padding);
      border-color: transparent;
      border-radius: var(--tw-comp-button-primary-rounded);
      background: var(--tw-comp-button-primary-background-color);
      color: var(--tw-comp-button-primary-text-color);
      font: var(--tw-comp-button-primary-font);
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
    ${FOCUS_RING}
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
    emit(this, "tw-campaign-open", { path });
  }

  #create = (event: Event): void => {
    event.preventDefault();
    const name = nameFrom(event.currentTarget);
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
    const name = nameFrom(form);
    if (name !== undefined) {
      this.#dispatchCreate(name, true);
    }
  };

  #dispatchCreate(name: string, elsewhere: boolean): void {
    emit(this, "tw-campaign-create", { name, elsewhere });
  }

  // Choosing a folder is the app's, since only the desktop shell has a dialog for it.
  #browse = (): void => {
    emit(this, "tw-campaign-browse");
  };
}

customElements.define("tw-campaigns", TwCampaigns);

declare global {
  interface HTMLElementTagNameMap {
    "tw-campaigns": TwCampaigns;
  }
  interface HTMLElementEventMap {
    "tw-campaign-open": CustomEvent<{ path: string }>;
    "tw-campaign-create": CustomEvent<{ name: string; elsewhere: boolean }>;
    "tw-campaign-browse": CustomEvent<null>;
  }
}
