/**
 * ─ Tool rail ─
 *
 * What the pointer does on the board. Move is the rest; picking an ink
 * picks up a pen, and the palette beside the rail holds its shapes and
 * options. Move or Esc puts the pen down. The ruler sits under Move,
 * measuring instead of moving. The history of strokes opens from the
 * rail's foot, since it is the scene's and not any one ink's. There is no
 * Build mode to enter: the rail is on the desk the way pens are.
 */

import { LitElement, css, html, nothing } from "lit";
import type { HeightDisplay, Permission, Role, Stroke, Visibility } from "@tablewright/schema";
import type { GridRule } from "@tablewright/board";
import {
  DEFAULT_RULE,
  DEFAULT_TOOL,
  INKS,
  RULER_MODES,
  defaultArea,
  withInk,
  type DrawTool,
  type Ink,
  type PlayTool,
  type Area,
  type OriginSnap,
  type RulerMode,
  NO_ROLE,
  allows,
} from "@tablewright/board";
import {
  HISTORY_ICON,
  ICON_STYLES,
  KEPT_ICON,
  TOPOLOGY_ICON,
  MOVE_ICON,
  SHOWN_ICON,
  RULER_ICON,
  UNDO_ICON,
  inkIcon,
  rulerIcon,
} from "../icons.js";
import { emit } from "../events.js";
import { FOCUS_RING, PANEL_CHROME } from "../styles.js";
import { COUNT_PILL } from "./panel-styles.js";
import "./tw-pen-palette.js";
import "./tw-ruler-column.js";
import "./tw-stroke-history.js";

// Which permission each pen wants. The rail shows the pens a hand holds
// and no others, so a table that lets its players draw freely and nothing
// else gives them one pen.
const INK_NEEDS: Record<Ink, Permission> = {
  ground: "ink:ground:draw",
  threshold: "ink:threshold:draw",
  wall: "ink:wall:draw",
  height: "ink:height:draw",
  "level-change": "ink:level-change:draw",
  free: "ink:free:draw",
};

export class TwToolRail extends LitElement {
  static override properties = {
    tool: { attribute: false },
    held: { type: Boolean },
    play: { attribute: false },
    mode: { attribute: false },
    area: { attribute: false },
    rule: { attribute: false },
    snap: { attribute: false },
    seen: { attribute: false },
    twRole: { attribute: false },
    marking: { attribute: false },
    strokes: { attribute: false },
    topology: { type: Boolean },
    cellPx: { attribute: false },
    display: { attribute: false },
    historyOpen: { state: true },
  };

  /** The pen's settings, kept while it is down so it comes back as it was. */
  declare tool: DrawTool;
  /** Whether a pen is held: the pointer draws, and the tokens are inert. */
  declare held: boolean;
  /** What the pointer does once the pen is down: moves tokens, or measures. */
  declare play: PlayTool;
  /** What the column does: measures as a line or a path, or lays an area down. */
  declare mode: RulerMode;
  /** The area the column would lay down, with its sizes as they stand. */
  declare area: Area;
  /** What a cell measures and in what unit, so a size reads in the system's own. */
  declare rule: GridRule;
  /** Where an area's origin may sit when one is put down. */
  declare snap: OriginSnap;
  /** Who the next measure or area is for. */
  declare seen: Visibility;
  /** The role this rail serves; `tw` because every element already has a DOM `role`. */
  declare twRole: Role;
  /**
   * Who what this hand puts down is for. A DM setting something up the
   * table has not met yet marks it their own and builds as usual.
   */
  declare marking: Visibility;
  declare strokes: Stroke[];
  /** Whether the DM is reading the scene as numbers: their own view, not the scene's. */
  declare topology: boolean;
  /** The scene's cell in map pixels, so a brush can be sized in them. */
  declare cellPx: number;
  declare display: HeightDisplay;
  declare historyOpen: boolean;

  constructor() {
    super();
    this.tool = DEFAULT_TOOL;
    this.held = false;
    this.play = "move";
    this.mode = "line";
    this.rule = DEFAULT_RULE;
    this.area = defaultArea("cone", DEFAULT_RULE);
    this.snap = "centre";
    this.seen = "party";
    this.twRole = NO_ROLE;
    this.marking = "party";
    this.strokes = [];
    this.topology = false;
    this.cellPx = 50;
    this.display = { mode: "shaded", strength: 80 };
    this.historyOpen = false;
  }

  static override styles = css`
    ${ICON_STYLES}
    :host {
      position: fixed;
      top: 56px;
      left: var(--tw-space-md);
      z-index: 120;
      display: flex;
      align-items: flex-start;
      gap: var(--tw-space-sm);
      /* Only the rail and the panels take the pointer; the board shows
         through under the palette. */
      pointer-events: none;
      font: var(--tw-typo-label-md-font);
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
      pointer-events: auto;
      ${PANEL_CHROME}
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
    .tip {
      position: absolute;
      /* Over the column beside the rail, which comes later in the tree. */
      z-index: 1;
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
    ${COUNT_PILL}
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
    ${FOCUS_RING}
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
    const may = (permission: Permission): boolean => allows(this.twRole, permission);
    const inks = INKS.filter((spec) => may(INK_NEEDS[spec.ink]));
    const record = may("history:read") || may("history:undo");
    const inColumn = this.#inColumn;
    return html`
      <div class="rail" role="toolbar" aria-label="Tools">
        ${
          may("scene:hide")
            ? html`<button
                  class="icon"
                  type="button"
                  aria-label="Layer"
                  aria-pressed=${this.marking === "dm" ? "true" : "false"}
                  @click=${() => this.#setMarking(this.marking === "dm" ? "party" : "dm")}
                >
                  ${this.marking === "dm" ? KEPT_ICON : SHOWN_ICON}
                  <span class="tip">Layer: ${this.marking === "dm" ? "DM" : "Token"}</span>
                </button>
                <div class="divider"></div>`
            : nothing
        }
          <button
            class="icon"
            type="button"
            aria-label="Move"
            aria-pressed=${!held && this.play === "move" ? "true" : "false"}
            @click=${this.#move}
          >
            ${MOVE_ICON}<span class="tip">Move</span>
          </button>
          <button
            class="icon"
            type="button"
            aria-label="Ruler"
            aria-pressed=${!held && this.play === "ruler" ? "true" : "false"}
            @click=${this.#measure}
          >
            ${RULER_ICON}<span class="tip">Ruler: R</span>
          </button>
          ${
            may("topology:read")
              ? html`<button
                  class="icon"
                  type="button"
                  aria-label="Topology"
                  aria-pressed=${this.topology ? "true" : "false"}
                  @click=${this.#topology}
                >
                  ${TOPOLOGY_ICON}<span class="tip">Topology: T</span>
                </button>`
              : nothing
          }
          ${
            inks.length === 0
              ? nothing
              : html`<div class="divider"></div>
                  ${inks.map(
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
                  )}`
          }
          ${record ? html`<div class="divider"></div>` : nothing}
          ${
            may("history:undo")
              ? html`<button class="icon" type="button" aria-label="Undo" @click=${this.#undo}>
                  ${UNDO_ICON}<span class="tip">Undo: Ctrl+Z</span>
                </button>`
              : nothing
          }
          ${
            may("history:read")
              ? html`<button
                  class="icon"
                  type="button"
                  aria-label="History"
                  aria-pressed=${this.historyOpen ? "true" : "false"}
                  @click=${() => {
                    this.historyOpen = !this.historyOpen;
                  }}
                >
                  ${HISTORY_ICON}
                  ${
                    this.strokes.length > 0
                      ? html`<span class="count">${this.strokes.length}</span>`
                      : nothing
                  }
                  <span class="tip">History</span>
                </button>`
              : nothing
          }
        </div>
      </div>
      ${inColumn ? this.#modes() : nothing}
      ${
        held || this.historyOpen || inColumn
          ? html`<div class="side">
              ${
                held
                  ? html`<tw-pen-palette
                      .tool=${tool}
                      .cellPx=${this.cellPx}
                      .display=${this.display}
                      @tw-tool-change=${this.#retool}
                    ></tw-pen-palette>`
                  : nothing
              }
              ${
                inColumn
                  ? html`<tw-ruler-column
                      .mode=${this.mode}
                      .area=${this.area}
                      .rule=${this.rule}
                      .snap=${this.snap}
                      .seen=${this.seen}
                      .twRole=${this.twRole}
                      @tw-area=${this.#onArea}
                      @tw-snap=${this.#onSnap}
                      @tw-seen=${this.#onSeen}
                    ></tw-ruler-column>`
                  : nothing
              }
              ${
                this.historyOpen
                  ? html`<tw-stroke-history .strokes=${this.strokes}></tw-stroke-history>`
                  : nothing
              }
            </div>`
          : nothing
      }
    `;
  }

  // Whether the ruler's column has the pointer: every mode there has a panel.
  get #inColumn(): boolean {
    return !this.held && this.play === "ruler";
  }

  // The ruler's modes, a second column beside the rail once the ruler is
  // picked, as Foundry does; the last three lay an area down.
  #modes() {
    return html`<div class="rail" role="toolbar" aria-label="Ruler modes">
      ${RULER_MODES.map(
        (spec) =>
          html`<button
            class="icon"
            type="button"
            aria-label=${spec.name}
            aria-pressed=${this.mode === spec.mode ? "true" : "false"}
            @click=${() => this.#setMode(spec.mode)}
          >
            ${rulerIcon(spec.mode)}<span class="tip">${spec.name}</span>
          </button>`
      )}
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

  // The palette asks for the next pen; the rail holds it and says so.
  #retool = (event: HTMLElementEventMap["tw-tool-change"]): void => {
    this.tool = event.detail.tool;
    this.#emitTool();
  };

  // The column's choices are the rail's to keep: the app reads them here
  // and writes them back here, and the column shows what it is given.
  #onArea = (event: HTMLElementEventMap["tw-area"]): void => {
    this.area = event.detail.area;
  };

  #onSnap = (event: HTMLElementEventMap["tw-snap"]): void => {
    this.snap = event.detail.snap;
  };

  #onSeen = (event: HTMLElementEventMap["tw-seen"]): void => {
    this.seen = event.detail.seen;
  };

  // Move and the ruler are the two hands of Play; either puts the pen down.
  #move = (): void => {
    this.putDown();
    this.#play("move");
  };

  #measure = (): void => {
    this.putDown();
    this.#play("ruler");
  };

  #play(tool: PlayTool): void {
    if (tool === this.play) {
      return;
    }
    this.play = tool;
    emit(this, "tw-play", { tool });
  }

  #setMarking(marking: Visibility): void {
    this.marking = marking;
    emit(this, "tw-marking", { marking });
  }

  #setMode(mode: RulerMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    emit(this, "tw-ruler", { mode });
  }

  // The tool held, or undefined once the pen is down.
  #emitTool(): void {
    emit(this, "tw-tool", { tool: this.held ? this.tool : undefined });
  }

  // The Topology view is the DM's way of looking, so the rail reports the
  // ask and the board keeps it; nothing about it reaches the scene.
  #topology = (): void => {
    emit(this, "tw-topology", { on: !this.topology });
  };

  #undo = (): void => {
    emit(this, "tw-undo");
  };

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
  interface HTMLElementEventMap {
    "tw-tool": CustomEvent<{ tool: DrawTool | undefined }>;
    "tw-play": CustomEvent<{ tool: PlayTool }>;
    "tw-ruler": CustomEvent<{ mode: RulerMode }>;
    "tw-marking": CustomEvent<{ marking: Visibility }>;
    "tw-topology": CustomEvent<{ on: boolean }>;
    "tw-undo": CustomEvent<null>;
  }
}
