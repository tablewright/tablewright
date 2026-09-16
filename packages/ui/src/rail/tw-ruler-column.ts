/**
 * ─ Ruler column ─
 *
 * The panel beside the ruler's modes: an area's own sizes, and for every
 * mode who sees it. What an area catches is shown by lighting the tokens
 * on the board, not by a paragraph in a panel. The rail keeps the mode,
 * the area and the choices; the column shows them and asks for changes.
 */

import { LitElement, html, nothing } from "lit";
import type { Role, Visibility } from "@tablewright/schema";
import type { GridRule } from "@tablewright/board";
import {
  DEFAULT_RULE,
  ORIGIN_SNAPS,
  RULER_MODES,
  SEEN_BY,
  clamped,
  defaultArea,
  isArea,
  type Area,
  type OriginSnap,
  type RulerMode,
  NO_ROLE,
  allows,
} from "@tablewright/board";
import { emit } from "../events.js";
import { PANEL_STYLES } from "./panel-styles.js";
import { numberRow, rangeRow, stripRow } from "./inputs.js";

// An area's own choices: how a cone's far edge is cut, and how each
// shape stands upward.
const EDGES = ["round", "flat"] as const;
const CONE_FORMS = ["flat", "3d"] as const;
const CONE_LABELS = { flat: "Flat", "3d": "3D" } as const;
const CIRCLE_FORMS = ["sphere", "dome", "cylinder"] as const;
const SNAP_LABELS = { centre: "Centre", corner: "Corner", free: "Free" } as const;
// Who a measure or an area is for, as the palette says it: the tiers are
// the core's, the words are the maker's own.
const SEEN_LABELS = { party: "Everyone", dm: "The DM", own: "Just me" } as const;
// A hand that may not show what it measures is offered nothing else.
const OWN_ONLY: readonly Visibility[] = ["own"];

// The name of a mode, for the head of its panel.
function nameOf(mode: RulerMode): string {
  return RULER_MODES.find((spec) => spec.mode === mode)?.name ?? mode;
}

export class TwRulerColumn extends LitElement {
  static override properties = {
    mode: { attribute: false },
    area: { attribute: false },
    rule: { attribute: false },
    snap: { attribute: false },
    seen: { attribute: false },
    twRole: { attribute: false },
  };

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
  /** The role this column serves; `tw` because every element already has a DOM `role`. */
  declare twRole: Role;

  constructor() {
    super();
    this.mode = "line";
    this.area = defaultArea("cone", DEFAULT_RULE);
    this.rule = DEFAULT_RULE;
    this.snap = "centre";
    this.seen = "party";
    this.twRole = NO_ROLE;
  }

  static override styles = PANEL_STYLES;

  override render() {
    const { area } = this;
    const isLaid = isArea(this.mode);
    return html`<div class="panel">
      <header>
        <div class="title">
          <span class="name">${nameOf(this.mode)}</span>
          <span class="hint">Press, drag, release</span>
        </div>
      </header>
      ${
        isLaid
          ? stripRow(
              "Starts at",
              ORIGIN_SNAPS,
              this.snap,
              (snap) => this.#setSnap(snap),
              SNAP_LABELS
            )
          : nothing
      }
      ${
        isLaid && area.kind === "rect"
          ? html`${this.#sizeRow("Length", area.length, (length) => this.#reshape({ length }))}
            ${this.#sizeRow("Width", area.width, (width) => this.#reshape({ width }))}
            ${this.#sizeRow("Height", area.height, (height) => this.#reshape({ height }))}
            ${this.#aimRow(area.aim, (aim) => this.#reshape({ aim }))}`
          : nothing
      }
      ${
        isLaid && area.kind === "cone"
          ? html`${this.#sizeRow("Length", area.length, (length) => this.#reshape({ length }))}
            ${rangeRow({
              cap: "Spread",
              aria: "Spread",
              value: area.spread,
              unit: `${area.spread}°`,
              min: 0,
              max: 90,
              step: 1,
              change: (spread) => this.#reshape({ spread }),
            })}
            ${stripRow("Far edge", EDGES, area.edge, (edge) => this.#reshape({ edge }))}
            ${stripRow("Stands as", CONE_FORMS, area.form, (form) => this.#reshape({ form }), CONE_LABELS)}
            ${
              area.form === "flat"
                ? this.#sizeRow("Tall", area.height, (height) => this.#reshape({ height }))
                : nothing
            }
            ${this.#aimRow(area.aim, (aim) => this.#reshape({ aim }))}`
          : nothing
      }
      ${
        isLaid && area.kind === "circle"
          ? html`${this.#sizeRow("Radius", area.radius, (radius) => this.#reshape({ radius }))}
            ${this.#sizeRow("Inner", area.inner, (inner) => this.#reshape({ inner }), area.radius - this.rule.cellSize)}
            ${stripRow("Stands as", CIRCLE_FORMS, area.form, (form) => this.#reshape({ form }))}
            ${
              area.form === "cylinder"
                ? this.#sizeRow("Tall", area.height, (height) => this.#reshape({ height }))
                : nothing
            }`
          : nothing
      }
      ${stripRow(
        "Seen by",
        allows(this.twRole, "ruler:show") ? SEEN_BY : OWN_ONLY,
        this.seen,
        (seen) => this.#setSeen(seen),
        SEEN_LABELS
      )}
    </div>`;
  }

  // The aim, for a hand that would rather type a bearing than turn one.
  #aimRow(value: number, change: (next: number) => void) {
    return numberRow({
      cap: "Aim",
      aria: "Aim",
      value: Math.round(value),
      unit: "°",
      min: 0,
      max: 359,
      step: 5,
      change,
    });
  }

  #sizeRow(label: string, value: number, change: (next: number) => void, most?: number) {
    return numberRow({
      cap: label,
      aria: label,
      value,
      unit: this.rule.unit,
      min: 0,
      max: most === undefined ? undefined : Math.max(0, most),
      step: this.rule.cellSize,
      change,
    });
  }

  #setSeen(seen: Visibility): void {
    emit(this, "tw-seen", { seen });
  }

  #setSnap(snap: OriginSnap): void {
    emit(this, "tw-snap", { snap });
  }

  // The area is the rail's while the column holds it, and the board hears
  // every change: there is nothing to commit, only what it is now.
  #reshape(change: Record<string, unknown>): void {
    emit(this, "tw-area", { area: clamped({ ...this.area, ...change } as Area, this.rule) });
  }
}

customElements.define("tw-ruler-column", TwRulerColumn);

declare global {
  interface HTMLElementTagNameMap {
    "tw-ruler-column": TwRulerColumn;
  }
  interface HTMLElementEventMap {
    "tw-area": CustomEvent<{ area: Area }>;
    "tw-snap": CustomEvent<{ snap: OriginSnap }>;
    "tw-seen": CustomEvent<{ seen: Visibility }>;
  }
}
