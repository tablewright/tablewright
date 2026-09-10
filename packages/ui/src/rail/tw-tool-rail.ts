// The DM's tool rail: what the pointer does on the board. Move is the
// rest; picking an ink is picking up a pen, and the palette beside the
// rail holds the pen's shapes and options. Putting the pen down is Move,
// or Esc. The history of strokes is the rail's own, opened from its foot,
// since it is the scene's and not any one ink's. There is no Build mode
// to enter: the rail is on the desk the way pens are.
//
// `tw-tool` carries the draw tool held, or undefined once the pen is
// down; `tw-undo` asks for the last stroke back; `tw-reset` for a reset
// stroke; `tw-remove` names a stroke by its place in the history.

import { LitElement, css, html, nothing } from "lit";
import type { Stroke } from "@tablewright/schema";
import "../strip/tw-strip.js";
import {
  DEFAULT_TOOL,
  DRAW_SHAPES,
  GROUND_STATES,
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
import { HISTORY_ICON, MOVE_ICON, UNDO_ICON, inkIcon, shapeIcon } from "./icons.js";
import { thresholdSwatch } from "./swatches.js";

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

// A brush's width on the map, in its pixels: a hairline up to a broad sweep.
const SIZE_PX = { min: 1, max: 300, step: 1 } as const;
// How much of the history shows until all of it is asked for.
const RECENT = 3;

export class TwToolRail extends LitElement {
  static override properties = {
    tool: { attribute: false },
    held: { type: Boolean },
    strokes: { attribute: false },
    readout: { type: String },
    cellSize: { attribute: false },
    historyOpen: { state: true },
    showAll: { state: true },
  };

  /** The pen's settings, kept while it is down so it comes back as it was. */
  declare tool: DrawTool;
  /** Whether a pen is held: the pointer draws, and the tokens are inert. */
  declare held: boolean;
  /** The scene's history of strokes, as it stands. */
  declare strokes: Stroke[];
  /** What is under the pointer, in words. */
  declare readout: string;
  /** The scene's cell in map pixels, so a brush can be sized in them. */
  declare cellSize: number;
  declare historyOpen: boolean;
  declare showAll: boolean;

  constructor() {
    super();
    this.tool = DEFAULT_TOOL;
    this.held = false;
    this.strokes = [];
    this.readout = "";
    this.cellSize = 50;
    this.historyOpen = false;
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
    .icon .count {
      position: absolute;
      right: 1px;
      bottom: 1px;
      padding: 0 4px;
      font-size: 9px;
    }
    .icon[aria-pressed="true"] .count {
      background: var(--tw-on-primary);
      color: var(--tw-primary);
    }
    .divider {
      height: 1px;
      margin: 0 2px;
      background: var(--tw-outline);
    }
    .side {
      display: flex;
      flex-direction: column;
      gap: var(--tw-space-sm);
    }
    .panel {
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
    .tiles {
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
    .tile:hover {
      background: var(--tw-surface-container-highest);
    }
    .tile[aria-pressed="true"] {
      border-color: var(--tw-primary-container);
      background: var(--tw-primary-container);
      color: var(--tw-on-primary-container);
    }
    .swatch {
      display: flex;
      justify-content: center;
      padding: var(--tw-space-xs) 0;
      border: 1px solid var(--tw-outline-variant);
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-board-ground);
    }
    .field {
      display: flex;
      align-items: center;
      gap: var(--tw-space-sm);
    }
    .number {
      width: 72px;
      padding: var(--tw-comp-input-padding);
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-input-rounded);
      background: var(--tw-comp-input-background-color);
      color: var(--tw-comp-input-text-color);
      font: inherit;
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
    }
    .range {
      flex: 1;
      min-width: 0;
      margin: 0;
      accent-color: var(--tw-primary);
    }
    .unit {
      min-width: 5.5ch;
      color: var(--tw-on-surface-variant);
      font-size: var(--tw-typo-body-sm-font-size);
      font-weight: var(--tw-typo-body-sm-font-weight);
      letter-spacing: 0;
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .history-head {
      display: flex;
      align-items: center;
      gap: var(--tw-space-sm);
    }
    .reset {
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
    .reset:hover {
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
        <div class="divider"></div>
        <button class="icon" type="button" aria-label="Undo" @click=${this.#undo}>
          ${UNDO_ICON}<span class="tip">Undo · Ctrl+Z</span>
        </button>
        <button
          class="icon"
          type="button"
          aria-label="History"
          aria-pressed=${this.historyOpen ? "true" : "false"}
          @click=${() => {
            this.historyOpen = !this.historyOpen;
          }}
        >
          ${HISTORY_ICON}
          ${this.strokes.length > 0 ? html`<span class="count">${this.strokes.length}</span>` : nothing}
          <span class="tip">History</span>
        </button>
      </div>
      ${
        held || this.historyOpen
          ? html`<div class="side">
              ${held ? this.#palette() : nothing}${this.historyOpen ? this.#history() : nothing}
            </div>`
          : nothing
      }
      ${this.readout === "" ? nothing : html`<div class="readout">${this.readout}</div>`}
    `;
  }

  #palette() {
    const { tool } = this;
    const spec = INKS.find((candidate) => candidate.ink === tool.ink);
    return html`<div class="panel">
      <header>
        <span class="badge">${inkIcon(tool.ink)}</span>
        <div class="title">
          <span class="name">${spec?.name ?? tool.ink}</span>
          <span class="hint">${HINTS[tool.ink]}</span>
        </div>
        <span class="tag">${NATURE[tool.ink]}</span>
      </header>
      ${tool.ink === "threshold" ? this.#thresholdPreview() : this.#shapes()}
      ${tool.shape === "brush" && tool.ink !== "threshold" ? this.#size() : nothing}
      ${this.#options()}
    </div>`;
  }

  // A threshold has one shape, the click, so the palette shows what the
  // click will leave instead: the kind, state and size chosen, drawn.
  #thresholdPreview() {
    return html`<section>
      <span class="cap">Preview</span>
      <div class="swatch">${thresholdSwatch(this.tool.threshold)}</div>
    </section>`;
  }

  #shapes() {
    const { tool } = this;
    const shapes = shapesOf(tool.ink);
    return html`<section>
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
    </section>`;
  }

  // The brush is sized in map pixels, as a painter would; the record keeps
  // the radius in cells so the stroke means the same on any grid.
  #size() {
    const px = Math.max(SIZE_PX.min, Math.round(this.tool.radius * 2 * this.cellSize));
    return html`<section>
      <span class="cap">Size</span>
      <div class="field">
        <input
          class="range"
          type="range"
          min=${SIZE_PX.min}
          max=${SIZE_PX.max}
          step=${SIZE_PX.step}
          aria-label="Brush size in pixels"
          .value=${String(px)}
          @input=${this.#sizeInput}
        />
        <span class="unit">${px} px</span>
      </div>
    </section>`;
  }

  #options() {
    switch (this.tool.ink) {
      case "ground":
        return html`<section>
          <span class="cap">State</span>
          <tw-strip
            label="Ground state"
            .values=${GROUND_STATES}
            .pressed=${[this.tool.ground]}
            @tw-cell=${this.#choose(GROUND_STATES, (ground) => this.#update({ ground }))}
          ></tw-strip>
        </section>`;
      case "threshold":
        return html`<section>
            <span class="cap">Kind</span>
            <tw-strip
              label="Kind"
              .values=${THRESHOLD_KINDS}
              .pressed=${[this.tool.threshold.kind]}
              @tw-cell=${this.#choose(THRESHOLD_KINDS, (kind) => this.#threshold({ kind }))}
            ></tw-strip>
          </section>
          <section>
            <span class="cap">State</span>
            <tw-strip
              label="State"
              .values=${THRESHOLD_STATES}
              .pressed=${[this.tool.threshold.state]}
              @tw-cell=${this.#choose(THRESHOLD_STATES, (state) => this.#threshold({ state }))}
            ></tw-strip>
          </section>
          <section>
            <span class="cap">Size · windows</span>
            <tw-strip
              label="Size"
              .values=${OPENING_SIZES}
              .pressed=${[this.tool.threshold.size]}
              @tw-cell=${this.#choose(OPENING_SIZES, (size) => this.#threshold({ size }))}
            ></tw-strip>
          </section>`;
      case "height":
        return html`<section>
          <span class="cap">Amount</span>
          <div class="field">
            <input
              class="number"
              type="number"
              step="5"
              aria-label="Height amount"
              .value=${String(this.tool.height)}
              @input=${this.#heightInput}
            />
            <span class="unit">ft · ${signed(this.tool.height)}</span>
          </div>
        </section>`;
      default:
        return nothing;
    }
  }

  // Newest first: what was just drawn is what the DM wants back or gone.
  #history() {
    const total = this.strokes.length;
    const entries = this.strokes.map((stroke, index) => ({ stroke, index })).reverse();
    const shown = this.showAll ? entries : entries.slice(0, RECENT);
    return html`<div class="panel">
      <div class="history-head">
        <span class="cap">History</span>
        <span class="count">${total}</span>
        <button
          class="reset"
          type="button"
          title="Clear everything drawn; the reset stays in the history"
          @click=${this.#reset}
        >
          Reset
        </button>
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
    </div>`;
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

  // A number typed is taken as it comes; a field emptied or half-typed
  // changes nothing until it reads as a number again.
  #heightInput = (event: Event): void => {
    const height = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(height)) {
      this.#update({ height });
    }
  };

  #sizeInput = (event: Event): void => {
    const px = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(px) && px > 0 && this.cellSize > 0) {
      this.#update({ radius: px / 2 / this.cellSize });
    }
  };

  // A strip reports a value as a string; only one of the values it was
  // given can come back, so the typed one is looked up rather than trusted.
  #choose<T extends string>(values: readonly T[], apply: (value: T) => void) {
    return (event: Event): void => {
      const { value } = (event as CustomEvent<{ value: string }>).detail;
      const chosen = values.find((candidate) => candidate === value);
      if (chosen !== undefined) {
        apply(chosen);
      }
    };
  }

  #threshold(change: Partial<ThresholdChoice>): void {
    this.#update({ threshold: { ...this.tool.threshold, ...change } });
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

  #reset = (): void => {
    this.dispatchEvent(new CustomEvent("tw-reset", { bubbles: true, composed: true }));
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
