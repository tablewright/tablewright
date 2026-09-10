// The DM's tool rail: what the pointer does on the board. Move is the
// rest; picking an ink is picking up a pen, and the palette beside the
// rail holds the pen's shapes and options and the record. Putting the
// pen down is Move, or Esc. There is no Build mode to enter: the rail
// is on the desk the way pens are.
//
// `tw-tool` carries the draw tool held, or undefined once the pen is
// down; `tw-undo` asks for the last stroke back; `tw-remove` names a
// stroke by its place in the record.

import { LitElement, css, html, nothing } from "lit";
import type { Stroke } from "@tablewright/schema";
import {
  DEFAULT_TOOL,
  DRAW_SHAPES,
  GROUND_STATES,
  HEIGHTS,
  INKS,
  OPENING_SIZES,
  THRESHOLD_KINDS,
  THRESHOLD_STATES,
  describeStroke,
  shapesOf,
  signed,
  withInk,
  type DrawShape,
  type DrawTool,
  type Ink,
  type ThresholdChoice,
} from "@tablewright/board";
import { MOVE_ICON, inkIcon, shapeIcon } from "./icons.js";

const HINTS: Record<Ink, string> = {
  ground: "Paint or drag what can be stood on",
  threshold: "Click a cell edge to place it",
  wall: "Drag a line along the grid, or a rect for four",
  height: "Paint or drag an amount into the field",
  "level-change": "Paint where a change of height is walked",
  free: "Ink with no rules meaning",
};

// What a stroke of each ink is to the scene: rules the board reads, or a
// mark on the picture and nothing more. Whether a rules stroke also
// shows as texture is a choice still to be made per stroke.
const NATURE: Record<Ink, string> = {
  ground: "Data",
  threshold: "Data",
  wall: "Data",
  height: "Data",
  "level-change": "Data",
  free: "Texture",
};

// How much of the record shows until all of it is asked for.
const RECENT = 3;

export class TwToolRail extends LitElement {
  static override properties = {
    tool: { attribute: false },
    held: { type: Boolean },
    strokes: { attribute: false },
    readout: { type: String },
    showAll: { state: true },
  };

  /** The pen's settings, kept while it is down so it comes back as it was. */
  declare tool: DrawTool;
  /** Whether a pen is held: the pointer draws, and the tokens are inert. */
  declare held: boolean;
  /** The scene's record, as it stands. */
  declare strokes: Stroke[];
  /** What is under the pointer, in words. */
  declare readout: string;
  declare showAll: boolean;

  constructor() {
    super();
    this.tool = DEFAULT_TOOL;
    this.held = false;
    this.strokes = [];
    this.readout = "";
    this.showAll = false;
  }

  static override styles = css`
    :host {
      position: fixed;
      top: 56px;
      left: var(--tw-space-md);
      z-index: 120;
      display: flex;
      align-items: flex-start;
      gap: var(--tw-space-sm);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
    }
    :host([hidden]) {
      display: none;
    }
    .rail {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-xs);
      padding: var(--tw-space-xs);
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-panel-rounded);
      background: var(--tw-comp-panel-background-color);
    }
    .icon {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: var(--tw-rounded-sm);
      background: transparent;
      color: var(--tw-on-surface);
      cursor: pointer;
    }
    .icon:hover {
      background: var(--tw-surface-container-highest);
    }
    .icon[aria-pressed="true"] {
      background: var(--tw-primary);
      color: var(--tw-on-primary);
    }
    .icon svg {
      display: block;
    }
    .tip {
      position: absolute;
      left: calc(100% + 10px);
      top: 50%;
      padding: var(--tw-space-xs) var(--tw-space-sm);
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-highest);
      color: var(--tw-on-surface);
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-50%);
      transition: opacity 80ms;
    }
    .icon:hover .tip,
    .icon:focus-visible .tip {
      opacity: 1;
    }
    .divider {
      height: 1px;
      margin: 0 2px;
      background: var(--tw-outline);
    }
    .palette {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 236px;
      padding: 10px;
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-panel-rounded);
      background: var(--tw-comp-panel-background-color);
      color: var(--tw-comp-panel-text-color);
    }
    header {
      display: flex;
      align-items: center;
      gap: var(--tw-space-sm);
    }
    .badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-primary);
      color: var(--tw-on-primary);
    }
    .title {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
    }
    .tag {
      align-self: flex-start;
      padding: 2px 6px;
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-full);
      color: var(--tw-on-surface-variant);
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .name {
      font-size: var(--tw-typo-body-md-font-size);
      letter-spacing: 0;
    }
    .hint {
      color: var(--tw-on-surface-variant);
      font-size: var(--tw-typo-body-sm-font-size);
      font-weight: var(--tw-typo-body-sm-font-weight);
      line-height: var(--tw-typo-body-sm-line-height);
      letter-spacing: 0;
    }
    section {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-xs);
    }
    .cap {
      color: var(--tw-comp-panel-title-text-color);
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .tiles,
    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tw-space-xs);
    }
    .tile {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-lowest);
      color: var(--tw-on-surface);
      cursor: pointer;
    }
    .tile svg {
      display: block;
    }
    .pill {
      padding: 5px 9px;
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: transparent;
      color: var(--tw-on-surface);
      font: inherit;
      letter-spacing: inherit;
      white-space: nowrap;
      cursor: pointer;
    }
    .tile:hover,
    .pill:hover {
      background: var(--tw-surface-container-highest);
    }
    .tile[aria-pressed="true"],
    .pill[aria-pressed="true"] {
      border-color: var(--tw-primary-container);
      background: var(--tw-primary-container);
      color: var(--tw-on-primary-container);
    }
    .record-head {
      display: flex;
      align-items: center;
      gap: var(--tw-space-sm);
    }
    .count {
      padding: 1px 6px;
      border-radius: var(--tw-rounded-full);
      background: var(--tw-primary);
      color: var(--tw-on-primary);
      font-size: 10px;
      font-weight: 700;
      line-height: 1.4;
      letter-spacing: 0;
    }
    .undo {
      margin-left: auto;
      padding: var(--tw-space-xs) var(--tw-space-sm);
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-comp-button-quiet-background-color);
      color: var(--tw-comp-button-quiet-text-color);
      font: inherit;
      font-size: 11px;
      letter-spacing: inherit;
      cursor: pointer;
    }
    .undo:hover {
      background: var(--tw-surface-container-highest);
    }
    ol {
      display: flex;
      flex-direction: column;
      gap: 1px;
      max-height: 40vh;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
      font-size: var(--tw-typo-body-sm-font-size);
      font-weight: var(--tw-typo-body-sm-font-weight);
      line-height: var(--tw-typo-body-sm-line-height);
      letter-spacing: 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--tw-space-sm);
      padding: var(--tw-space-xs) 6px;
      border-radius: var(--tw-rounded-sm);
    }
    li:hover {
      background: var(--tw-surface-container-high);
    }
    .n {
      min-width: 2ch;
      color: var(--tw-on-surface-variant);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .what {
      flex: 1;
    }
    .who {
      color: var(--tw-primary);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .x {
      margin-left: auto;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 0;
      border-radius: var(--tw-rounded-sm);
      background: transparent;
      color: var(--tw-on-surface-variant);
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }
    .x:hover {
      background: var(--tw-surface-container-highest);
      color: var(--tw-on-surface);
    }
    .link {
      align-self: flex-start;
      padding: 2px 6px;
      border: 0;
      background: transparent;
      color: var(--tw-on-surface-variant);
      font-size: var(--tw-typo-body-sm-font-size);
      font-weight: var(--tw-typo-body-sm-font-weight);
      letter-spacing: 0;
      cursor: pointer;
    }
    .link:hover {
      color: var(--tw-on-surface);
    }
    .empty {
      padding: var(--tw-space-xs) 6px;
      color: var(--tw-on-surface-variant);
      font-size: var(--tw-typo-body-sm-font-size);
      font-weight: var(--tw-typo-body-sm-font-weight);
      letter-spacing: 0;
    }
    .readout {
      position: fixed;
      left: var(--tw-space-md);
      bottom: var(--tw-space-md);
      padding: 6px 10px;
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-comp-panel-background-color);
      color: var(--tw-on-surface-variant);
      font-size: var(--tw-typo-body-sm-font-size);
      font-weight: var(--tw-typo-body-sm-font-weight);
      line-height: var(--tw-typo-body-sm-line-height);
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
    }
    :focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 2px;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.#keydown);
  }

  override disconnectedCallback(): void {
    window.removeEventListener("keydown", this.#keydown);
    super.disconnectedCallback();
  }

  /** Put the pen down: the pointer moves tokens again. */
  putDown = (): void => {
    if (!this.held) {
      return;
    }
    this.held = false;
    this.#emitTool();
  };

  override render() {
    const { tool, held } = this;
    return html`
      <div class="rail" role="toolbar" aria-label="Tools">
        <button
          class="icon"
          type="button"
          aria-label="Move"
          aria-pressed=${held ? "false" : "true"}
          @click=${this.putDown}
        >
          ${MOVE_ICON}<span class="tip">Move</span>
        </button>
        <div class="divider"></div>
        ${INKS.map(
          (spec) =>
            html`<button
              class="icon"
              type="button"
              aria-label=${spec.name}
              aria-pressed=${held && tool.ink === spec.ink ? "true" : "false"}
              @click=${() => this.#pick(spec.ink)}
            >
              ${inkIcon(spec.ink)}<span class="tip">${spec.name}</span>
            </button>`
        )}
      </div>
      ${held ? this.#palette() : nothing}
      ${this.readout === "" ? nothing : html`<div class="readout">${this.readout}</div>`}
    `;
  }

  #palette() {
    const { tool } = this;
    const spec = INKS.find((candidate) => candidate.ink === tool.ink);
    const shapes = shapesOf(tool.ink);
    return html`<div class="palette">
      <header>
        <span class="badge">${inkIcon(tool.ink)}</span>
        <div class="title">
          <span class="name">${spec?.name ?? tool.ink}</span>
          <span class="hint">${HINTS[tool.ink]}</span>
        </div>
        <span class="tag">${NATURE[tool.ink]}</span>
      </header>
      <section>
        <span class="cap">Shape</span>
        <div class="tiles">
          ${DRAW_SHAPES.filter((candidate) => shapes.includes(candidate.shape)).map(
            (candidate) =>
              html`<button
                class="tile"
                type="button"
                aria-label=${candidate.name}
                title=${candidate.name}
                aria-pressed=${tool.shape === candidate.shape ? "true" : "false"}
                @click=${() => this.#setShape(candidate.shape)}
              >
                ${shapeIcon(candidate.shape)}
              </button>`
          )}
        </div>
      </section>
      ${this.#options()}
      <div class="divider"></div>
      ${this.#record()}
    </div>`;
  }

  #options() {
    switch (this.tool.ink) {
      case "ground":
        return html`<section>
          <span class="cap">State</span>
          <div class="pills">
            ${GROUND_STATES.map(
              (state) =>
                html`<button
                  class="pill"
                  type="button"
                  aria-pressed=${this.tool.ground === state ? "true" : "false"}
                  @click=${() => this.#update({ ground: state })}
                >
                  ${state}
                </button>`
            )}
          </div>
        </section>`;
      case "threshold":
        return html`<section>
            <span class="cap">Kind</span>
            <div class="pills">
              ${THRESHOLD_KINDS.map((kind) => this.#thresholdPill({ kind }, this.tool.threshold.kind === kind, kind))}
            </div>
          </section>
          <section>
            <span class="cap">State</span>
            <div class="pills">
              ${THRESHOLD_STATES.map((state) => this.#thresholdPill({ state }, this.tool.threshold.state === state, state))}
            </div>
          </section>
          <section>
            <span class="cap">Size · windows</span>
            <div class="pills">
              ${OPENING_SIZES.map((size) => this.#thresholdPill({ size }, this.tool.threshold.size === size, size))}
            </div>
          </section>`;
      case "height":
        return html`<section>
          <span class="cap">Amount</span>
          <div class="pills">
            ${HEIGHTS.map(
              (height) =>
                html`<button
                  class="pill"
                  type="button"
                  aria-pressed=${this.tool.height === height ? "true" : "false"}
                  @click=${() => this.#update({ height })}
                >
                  ${signed(height)}
                </button>`
            )}
          </div>
        </section>`;
      default:
        return nothing;
    }
  }

  #thresholdPill(change: Partial<ThresholdChoice>, pressed: boolean, name: string) {
    return html`<button
      class="pill"
      type="button"
      aria-pressed=${pressed ? "true" : "false"}
      @click=${() => this.#update({ threshold: { ...this.tool.threshold, ...change } })}
    >
      ${name}
    </button>`;
  }

  #record() {
    const total = this.strokes.length;
    const first = this.showAll ? 0 : Math.max(0, total - RECENT);
    const shown = this.strokes
      .slice(first)
      .map((stroke, offset) => ({ stroke, index: first + offset }));
    return html`<section>
      <div class="record-head">
        <span class="cap">Record</span>
        <span class="count">${total}</span>
        <button class="undo" type="button" title="Undo (Ctrl+Z)" @click=${this.#undo}>Undo</button>
      </div>
      ${
        total === 0
          ? html`<span class="empty">Nothing drawn yet.</span>`
          : html`<ol>
              ${shown.map(
                ({ stroke, index }) =>
                  html`<li>
                    <span class="n">${index + 1}</span>
                    <span class="what">${describeStroke(stroke)}</span>
                    ${stroke.visibility === "dm" ? html`<span class="who">DM only</span>` : nothing}
                    <button
                      class="x"
                      type="button"
                      aria-label="Remove stroke ${index + 1}"
                      title="Remove this stroke"
                      @click=${() => this.#remove(index)}
                    >
                      ×
                    </button>
                  </li>`
              )}
            </ol>`
      }
      ${
        total > RECENT
          ? html`<button
              class="link"
              type="button"
              @click=${() => {
                this.showAll = !this.showAll;
              }}
            >
              ${this.showAll ? `Show the last ${RECENT}` : `Show all ${total}`}
            </button>`
          : nothing
      }
    </section>`;
  }

  // The same ink again puts the pen down; another ink picks it up.
  #pick(ink: Ink): void {
    if (this.held && this.tool.ink === ink) {
      this.putDown();
      return;
    }
    this.tool = withInk(this.tool, ink);
    this.held = true;
    this.#emitTool();
  }

  #setShape(shape: DrawShape): void {
    this.#update({ shape });
  }

  #update(change: Partial<DrawTool>): void {
    this.tool = { ...this.tool, ...change };
    this.#emitTool();
  }

  #emitTool(): void {
    this.dispatchEvent(
      new CustomEvent("tw-tool", {
        detail: { tool: this.held ? this.tool : undefined },
        bubbles: true,
        composed: true,
      })
    );
  }

  #undo = (): void => {
    this.dispatchEvent(new CustomEvent("tw-undo", { bubbles: true, composed: true }));
  };

  #remove(index: number): void {
    this.dispatchEvent(
      new CustomEvent("tw-remove", { detail: { index }, bubbles: true, composed: true })
    );
  }

  // Esc puts the pen down, unless something else took the key: a gesture
  // mid-drag cancels itself first, and says so by preventing the default.
  #keydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.held) {
      return;
    }
    queueMicrotask(() => {
      if (!event.defaultPrevented) {
        this.putDown();
      }
    });
  };
}

customElements.define("tw-tool-rail", TwToolRail);

declare global {
  interface HTMLElementTagNameMap {
    "tw-tool-rail": TwToolRail;
  }
}
