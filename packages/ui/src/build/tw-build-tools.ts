// The DM's drawing toolbar: Play or Build, and in Build the ink, the shape
// the ink takes, the ink's options, Undo, and the record of strokes with
// a remove on each. The board draws; this only says what with.
//
// `tw-mode` carries the mode; `tw-tool` the tool as it now stands;
// `tw-undo` asks for the last stroke back; `tw-remove` names a stroke by
// its place in the record.

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

export type BuildMode = "play" | "build";

export class TwBuildTools extends LitElement {
  static override properties = {
    mode: { type: String },
    tool: { attribute: false },
    strokes: { attribute: false },
    readout: { type: String },
    recordOpen: { state: true },
  };

  declare mode: BuildMode;
  declare tool: DrawTool;
  /** The scene's record, as it stands. */
  declare strokes: Stroke[];
  /** What is under the pointer, in words. */
  declare readout: string;
  declare recordOpen: boolean;

  constructor() {
    super();
    this.mode = "play";
    this.tool = DEFAULT_TOOL;
    this.strokes = [];
    this.readout = "";
    this.recordOpen = false;
  }

  static override styles = css`
    :host {
      position: fixed;
      top: var(--tw-space-md);
      left: 50%;
      z-index: 120;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--tw-space-xs);
      max-width: min(70vw, 960px);
      transform: translateX(-50%);
      font-family: var(--tw-typo-label-md-font-family);
      font-size: var(--tw-typo-label-md-font-size);
      font-weight: var(--tw-typo-label-md-font-weight);
      line-height: var(--tw-typo-label-md-line-height);
      letter-spacing: var(--tw-typo-label-md-letter-spacing);
    }
    :host([hidden]) {
      display: none;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: var(--tw-space-sm);
      padding: var(--tw-space-xs);
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-panel-rounded);
      background: var(--tw-comp-panel-background-color);
      color: var(--tw-comp-panel-text-color);
    }
    .group {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 2px;
      border-radius: var(--tw-rounded-sm);
      background: var(--tw-surface-container-lowest);
    }
    .label {
      padding: 0 var(--tw-space-xs) 0 var(--tw-space-sm);
      color: var(--tw-comp-panel-title-text-color);
      font-size: var(--tw-comp-panel-title-font-size);
      text-transform: uppercase;
    }
    button {
      padding: var(--tw-comp-button-quiet-padding) var(--tw-space-md);
      border: 0;
      border-radius: var(--tw-rounded-sm);
      background: transparent;
      color: var(--tw-comp-button-quiet-text-color);
      font: inherit;
      letter-spacing: inherit;
      white-space: nowrap;
      cursor: pointer;
    }
    button:hover {
      background: var(--tw-surface-container-highest);
    }
    button[aria-pressed="true"] {
      background: var(--tw-comp-button-primary-background-color);
      color: var(--tw-comp-button-primary-text-color);
    }
    button:disabled {
      opacity: 0.35;
      cursor: default;
    }
    button:focus-visible {
      outline: 2px solid var(--tw-focus-ring);
      outline-offset: 2px;
    }
    .readout {
      padding: 0 var(--tw-space-sm);
      color: var(--tw-on-surface-variant);
      font-weight: var(--tw-typo-body-sm-font-weight);
      letter-spacing: 0;
      text-transform: none;
      font-variant-numeric: tabular-nums;
    }
    .record {
      margin: 0;
      padding: var(--tw-space-xs);
      list-style: none;
      max-height: 40vh;
      min-width: 280px;
      overflow-y: auto;
      border: 1px solid var(--tw-outline);
      border-radius: var(--tw-comp-panel-rounded);
      background: var(--tw-comp-panel-background-color);
      color: var(--tw-comp-panel-text-color);
      font-weight: var(--tw-typo-body-sm-font-weight);
      letter-spacing: 0;
    }
    .record li {
      display: flex;
      align-items: center;
      gap: var(--tw-space-sm);
      padding: var(--tw-space-xs) var(--tw-space-sm);
    }
    .record li:hover {
      background: var(--tw-surface-container-high);
    }
    .record .index {
      min-width: 2ch;
      color: var(--tw-on-surface-variant);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .record .what {
      flex: 1;
    }
    .record .who {
      color: var(--tw-primary);
      font-size: var(--tw-comp-panel-title-font-size);
      text-transform: uppercase;
    }
    .record .empty {
      padding: var(--tw-space-sm);
      color: var(--tw-on-surface-variant);
    }
  `;

  override render() {
    const building = this.mode === "build";
    return html`
      <div class="bar">
        <div class="group" role="group" aria-label="Mode">
          <button
            type="button"
            aria-pressed=${!building ? "true" : "false"}
            @click=${() => this.#setMode("play")}
          >
            Play
          </button>
          <button
            type="button"
            aria-pressed=${building ? "true" : "false"}
            @click=${() => this.#setMode("build")}
          >
            Build
          </button>
        </div>
        ${building ? this.#buildControls() : nothing}
        ${this.readout === "" ? nothing : html`<span class="readout">${this.readout}</span>`}
      </div>
      ${building && this.recordOpen ? this.#record() : nothing}
    `;
  }

  #buildControls() {
    const shapes = shapesOf(this.tool.ink);
    return html`
      <div class="group" role="group" aria-label="Ink">
        ${INKS.map(
          (spec) =>
            html`<button
              type="button"
              aria-pressed=${this.tool.ink === spec.ink ? "true" : "false"}
              @click=${() => this.#setInk(spec.ink)}
            >
              ${spec.name}
            </button>`
        )}
      </div>
      <div class="group" role="group" aria-label="Shape">
        ${DRAW_SHAPES.map(
          (spec) =>
            html`<button
              type="button"
              ?disabled=${!shapes.includes(spec.shape)}
              aria-pressed=${this.tool.shape === spec.shape ? "true" : "false"}
              @click=${() => this.#setShape(spec.shape)}
            >
              ${spec.name}
            </button>`
        )}
      </div>
      ${this.#options()}
      <div class="group" role="group" aria-label="Record">
        <button type="button" title="Undo (Ctrl+Z)" @click=${this.#undo}>Undo</button>
        <button
          type="button"
          aria-pressed=${this.recordOpen ? "true" : "false"}
          @click=${() => {
            this.recordOpen = !this.recordOpen;
          }}
        >
          Record ${this.strokes.length}
        </button>
      </div>
    `;
  }

  #options() {
    switch (this.tool.ink) {
      case "ground":
        return html`<div class="group" role="group" aria-label="Ground state">
          ${GROUND_STATES.map(
            (state) =>
              html`<button
                type="button"
                aria-pressed=${this.tool.ground === state ? "true" : "false"}
                @click=${() => this.#update({ ground: state })}
              >
                ${state}
              </button>`
          )}
        </div>`;
      case "threshold":
        return html`<div class="group" role="group" aria-label="Threshold">
          <span class="label">Kind</span>
          ${THRESHOLD_KINDS.map((kind) => this.#thresholdButton({ kind }, this.tool.threshold.kind === kind, kind))}
          <span class="label">State</span>
          ${THRESHOLD_STATES.map((state) => this.#thresholdButton({ state }, this.tool.threshold.state === state, state))}
          <span class="label">Size</span>
          ${OPENING_SIZES.map((size) => this.#thresholdButton({ size }, this.tool.threshold.size === size, size))}
        </div>`;
      case "height":
        return html`<div class="group" role="group" aria-label="Height">
          ${HEIGHTS.map(
            (height) =>
              html`<button
                type="button"
                aria-pressed=${this.tool.height === height ? "true" : "false"}
                @click=${() => this.#update({ height })}
              >
                ${signed(height)}
              </button>`
          )}
        </div>`;
      default:
        return nothing;
    }
  }

  #thresholdButton(change: Partial<ThresholdChoice>, pressed: boolean, name: string) {
    return html`<button
      type="button"
      aria-pressed=${pressed ? "true" : "false"}
      @click=${() => this.#update({ threshold: { ...this.tool.threshold, ...change } })}
    >
      ${name}
    </button>`;
  }

  #record() {
    if (this.strokes.length === 0) {
      return html`<ol class="record">
        <li class="empty">Nothing drawn yet.</li>
      </ol>`;
    }
    return html`<ol class="record">
      ${this.strokes.map(
        (stroke, index) =>
          html`<li>
            <span class="index">${index + 1}</span>
            <span class="what">${describeStroke(stroke)}</span>
            ${stroke.visibility === "dm" ? html`<span class="who">DM only</span>` : nothing}
            <button
              type="button"
              aria-label="Remove stroke ${index + 1}"
              title="Remove this stroke"
              @click=${() => this.#remove(index)}
            >
              ×
            </button>
          </li>`
      )}
    </ol>`;
  }

  #setMode(mode: BuildMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    this.dispatchEvent(
      new CustomEvent("tw-mode", { detail: { mode }, bubbles: true, composed: true })
    );
  }

  #setInk(ink: Ink): void {
    this.#emitTool(withInk(this.tool, ink));
  }

  #setShape(shape: DrawShape): void {
    this.#emitTool({ ...this.tool, shape });
  }

  #update(change: Partial<DrawTool>): void {
    this.#emitTool({ ...this.tool, ...change });
  }

  #emitTool(tool: DrawTool): void {
    this.tool = tool;
    this.dispatchEvent(
      new CustomEvent("tw-tool", { detail: { tool }, bubbles: true, composed: true })
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
}

customElements.define("tw-build-tools", TwBuildTools);

declare global {
  interface HTMLElementTagNameMap {
    "tw-build-tools": TwBuildTools;
  }
}
