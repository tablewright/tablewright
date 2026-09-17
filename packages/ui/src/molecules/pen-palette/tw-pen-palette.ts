/**
 * ─ Pen palette ─
 *
 * The panel beside a held pen: its shapes, what it shows as, where it
 * sits, and its own options. The rail holds the pen; the palette shows it
 * and asks for the next one, so what the board hears is the rail's to say.
 */

import { LitElement, html, nothing } from "lit";
import type { HeightDisplay } from "@tablewright/schema";
import {
  DEFAULT_TOOL,
  DRAW_SHAPES,
  GROUND_STATES,
  HEIGHT_MODES,
  INKS,
  LOOKS,
  OPENING_SIZES,
  THRESHOLD_KINDS,
  THRESHOLD_STATES,
  hasHeight,
  hasLook,
  hasTall,
  shapesOf,
  signed,
  type DrawShape,
  type DrawTool,
  type Ink,
  type ThresholdChoice,
} from "@tablewright/board";
import { ICON_STYLES, inkIcon, shapeIcon } from "../../atoms/icons.js";
import { thresholdSwatch } from "./swatches.js";
import { emit } from "../../utils/events.js";
import { PANEL_STYLES } from "../../atoms/panel-styles.js";
import { field, numberRow, rangeRow, strip, stripRow } from "../panel-inputs.js";

const HINTS: Record<Ink, string> = {
  ground: "Paint or drag what can be stood on",
  threshold: "Click a cell edge to place it",
  wall: "Drag a line along the grid, or a rect for four",
  height: "Paint or drag an amount into the field",
  "level-change": "Paint where a change of height is walked",
  free: "Ink with no rules meaning",
};

// What a stroke of an ink with no choice is to the scene: height is data
// the scene's display shows; free ink is a mark on the picture and
// nothing more. The other inks choose per stroke, on the palette.
const NATURE: Partial<Record<Ink, string>> = {
  height: "Data",
  free: "Texture",
};
const LOOK_LABELS = { data: "Data", both: "Data + texture" } as const;

// An area ink lies on the ground the map already has, or at a height it
// writes into the field itself.
const PLACES = ["level", "raised"] as const;
const PLACE_LABELS = { level: "Ground level", raised: "A height" } as const;

// A brush's width on the map, in its pixels: a hairline up to a broad sweep.
const SIZE_PX = { min: 1, max: 300, step: 1 } as const;

export class TwPenPalette extends LitElement {
  static override properties = {
    tool: { attribute: false },
    cellPx: { attribute: false },
    display: { attribute: false },
    strength: { state: true },
  };

  /** The pen as the rail holds it. */
  declare tool: DrawTool;
  /** The scene's cell in map pixels, so a brush can be sized in them. */
  declare cellPx: number;
  /** How the scene shows its heights. */
  declare display: HeightDisplay;
  /** The strength slider as it is dragged, before its release is sent. */
  declare strength: number | undefined;

  constructor() {
    super();
    this.tool = DEFAULT_TOOL;
    this.cellPx = 50;
    this.display = { mode: "shaded", strength: 80 };
    this.strength = undefined;
  }

  static override styles = [ICON_STYLES, PANEL_STYLES];

  override render() {
    const { tool } = this;
    const spec = INKS.find((candidate) => candidate.ink === tool.ink);
    return html`<div class="panel">
      <header>
        <span class="badge">${inkIcon(tool.ink)}</span>
        <div class="title">
          <span class="name">${spec?.name ?? tool.ink}</span>
          <span class="hint">${HINTS[tool.ink]}</span>
        </div>
        ${hasLook(tool.ink) ? nothing : html`<span class="tag">${NATURE[tool.ink]}</span>`}
      </header>
      ${this.#shapes()} ${this.#look()} ${this.#place()}
      ${tool.shape === "brush" ? this.#size() : nothing} ${this.#options()}
    </div>`;
  }

  // Every shape shows it, like the Height pen's amount; only brush size is a shape's own.
  // The amount is kept while the ink is put back on the ground, so turning
  // it off and on again does not lose it.
  #place() {
    const { tool } = this;
    if (hasHeight(tool.ink)) {
      return html`<section>
        <span class="cap">Sits at</span>
        ${strip(
          "Sits at",
          PLACES,
          tool.raised ? "raised" : "level",
          (place) => this.#update({ raised: place === "raised" }),
          PLACE_LABELS
        )}
        ${
          tool.raised
            ? field("number", {
                aria: "Height of the ground",
                value: tool.at,
                unit: `ft: ${signed(tool.at)}`,
                step: 5,
                change: (at) => this.#update({ at }),
              })
            : nothing
        }
      </section>`;
    }
    if (!hasTall(tool.ink)) {
      return nothing;
    }
    // No upper limit; nothing stands below its own foot.
    return numberRow({
      cap: "Stands",
      aria: "How tall it stands",
      value: tool.tall,
      unit: "ft tall",
      min: 0,
      step: 5,
      change: (tall) => this.#update({ tall }),
    });
  }

  // Whether the stroke also paints what it means onto the picture: for a
  // map whose art has no walls of its own.
  #look() {
    if (!hasLook(this.tool.ink)) {
      return nothing;
    }
    return stripRow(
      "Shows as",
      LOOKS,
      this.tool.look,
      (look) => this.#update({ look }),
      LOOK_LABELS
    );
  }

  // A threshold has one shape, the click, so its tile shows what the click
  // will leave instead of a cursor: the kind, state and size chosen, drawn.
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
              ${
                tool.ink === "threshold" && candidate.shape === "click"
                  ? thresholdSwatch(tool.threshold)
                  : shapeIcon(candidate.shape)
              }
            </button>`
        )}
      </div>
    </section>`;
  }

  // The brush is sized in map pixels, as a painter would; the record keeps
  // the radius in cells so the stroke means the same on any grid.
  #size() {
    const px = Math.max(SIZE_PX.min, Math.round(this.tool.radius * 2 * this.cellPx));
    return rangeRow({
      cap: "Size",
      aria: "Brush size in pixels",
      value: px,
      unit: `${px} px`,
      ...SIZE_PX,
      change: (next) => {
        if (this.cellPx > 0) {
          this.#update({ radius: next / 2 / this.cellPx });
        }
      },
    });
  }

  #options() {
    const { tool } = this;
    switch (tool.ink) {
      case "ground":
        return stripRow(
          "State",
          GROUND_STATES,
          tool.ground,
          (ground) => this.#update({ ground }),
          undefined,
          "Ground state"
        );
      case "threshold":
        return html`${stripRow("Kind", THRESHOLD_KINDS, tool.threshold.kind, (kind) => this.#threshold({ kind }))}
        ${stripRow("State", THRESHOLD_STATES, tool.threshold.state, (state) => this.#threshold({ state }))}
        ${stripRow(
          "Window size",
          OPENING_SIZES,
          tool.threshold.size,
          (size) => this.#threshold({ size }),
          undefined,
          "Size"
        )}`;
      case "height":
        return html`${numberRow({
            cap: "Amount",
            aria: "Height amount",
            value: tool.height,
            unit: `ft: ${signed(tool.height)}`,
            step: 5,
            change: (height) => this.#update({ height }),
          })}
          <section>
            <span class="cap">Display — this scene</span>
            ${strip("Height display", HEIGHT_MODES, this.display.mode, (mode) => this.#emitDisplay({ mode }))}
            ${this.#strengthField()}
          </section>`;
      default:
        return nothing;
    }
  }

  // The slider's number follows the drag; the scene hears it on release,
  // so a drag is one change to the scene and not a hundred.
  #strengthField() {
    const strength = this.strength ?? this.display.strength;
    return field("range", {
      aria: "Height display strength",
      value: strength,
      unit: `${strength}%`,
      min: 0,
      max: 100,
      step: 5,
      change: (next) => {
        this.strength = next;
      },
      release: (next) => {
        this.strength = undefined;
        this.#emitDisplay({ strength: next });
      },
    });
  }

  #setShape(shape: DrawShape): void {
    this.#update({ shape });
  }

  // The scene's height display is set from the Height pen's palette, since
  // that is where heights are.
  #emitDisplay(change: Partial<HeightDisplay>): void {
    emit(this, "tw-display", change);
  }

  #threshold(change: Partial<ThresholdChoice>): void {
    this.#update({ threshold: { ...this.tool.threshold, ...change } });
  }

  // The next pen is the rail's to hold; the palette asks for it.
  #update(change: Partial<DrawTool>): void {
    emit(this, "tw-tool-change", { tool: { ...this.tool, ...change } });
  }
}

customElements.define("tw-pen-palette", TwPenPalette);

declare global {
  interface HTMLElementTagNameMap {
    "tw-pen-palette": TwPenPalette;
  }
  interface HTMLElementEventMap {
    "tw-tool-change": CustomEvent<{ tool: DrawTool }>;
    "tw-display": CustomEvent<Partial<HeightDisplay>>;
  }
}
