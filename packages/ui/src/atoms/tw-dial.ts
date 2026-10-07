/**
 * ─ Dial ─
 *
 * An angle set by dragging round a face. Seen from above it is a compass
 * and its needle a bearing, clockwise from north; seen from the side it
 * is a half circle facing right and its needle a tilt from level, up
 * positive. A wedge as wide as the spread opens about the needle. The
 * number typed beside it is the keyboard's way in, so the dial takes the
 * pointer alone and is hidden from assistive tech.
 * Design: docs/templates.md "Yaw and pitch".
 */

import { LitElement, css, html, nothing, svg } from "lit";
import { aimVector, facingToward, pointOn } from "@tablewright/board";
import { emit } from "../utils/events.js";

/** Which way a dial is seen: from above as a compass, or from the side as a half circle. */
export type DialView = "above" | "side";

// The dial's box in pixels, and the face, the needle and the ticks inside
// it, drawn in the same pixels.
const SIZE = 64;
const CENTRE = SIZE / 2;
const FACE = 28;
const NEEDLE = 25;
const TICK = 4;
// The bearings a face is marked at: the compass's four points, and the
// half circle's straight up, level and straight down with the halves.
const TICKS: Readonly<Record<DialView, readonly number[]>> = {
  above: [0, 90, 180, 270],
  side: [0, 45, 90, 135, 180],
};

export class TwDial extends LitElement {
  static override properties = {
    view: { type: String },
    value: { attribute: false },
    spread: { attribute: false },
  };

  /** Seen from above, the value is a bearing; seen from the side, a tilt. */
  declare view: DialView;
  /** The angle, in degrees. */
  declare value: number;
  /** How wide a wedge opens about the needle, in degrees; nought draws the needle alone. */
  declare spread: number;

  constructor() {
    super();
    this.view = "above";
    this.value = 0;
    this.spread = 0;
  }

  static override styles = css`
    :host {
      display: block;
      width: ${SIZE}px;
      height: ${SIZE}px;
    }
    svg {
      display: block;
      cursor: grab;
      touch-action: none;
    }
    svg:active {
      cursor: grabbing;
    }
    .face {
      fill: var(--tw-surface-container-lowest);
      stroke: var(--tw-outline-variant);
      stroke-width: 1;
    }
    svg:hover .face {
      stroke: var(--tw-outline);
    }
    .tick {
      stroke: var(--tw-on-surface-variant);
      stroke-width: 1;
    }
    .wedge {
      fill: var(--tw-primary);
      fill-opacity: 0.22;
      stroke: var(--tw-primary);
      stroke-opacity: 0.6;
      stroke-width: 1;
      stroke-linejoin: round;
    }
    .needle {
      stroke: var(--tw-primary);
      stroke-width: 2;
      stroke-linecap: round;
    }
    .hub {
      fill: var(--tw-primary);
    }
  `;

  override render() {
    const bearing = this.#bearingOf(this.value);
    const half = this.spread / 2;
    const face =
      this.view === "above"
        ? svg`<circle class="face" cx=${CENTRE} cy=${CENTRE} r=${FACE}></circle>`
        : svg`<path class="face" d="M${CENTRE} ${CENTRE - FACE} A${FACE} ${FACE} 0 0 1 ${CENTRE} ${CENTRE + FACE} Z"></path>`;
    return html`<svg
      width=${SIZE}
      height=${SIZE}
      aria-hidden="true"
      @pointerdown=${this.#press}
      @pointermove=${this.#drag}
    >
      ${face}
      ${TICKS[this.view].map(
        (tick) =>
          svg`<path class="tick" d="M${toward(tick, FACE - TICK)} L${toward(tick, FACE)}"></path>`
      )}
      ${
        half > 0
          ? svg`<path class="wedge" d="M${CENTRE} ${CENTRE} L${toward(bearing - half, FACE)} A${FACE} ${FACE} 0 0 1 ${toward(bearing + half, FACE)} Z"></path>`
          : nothing
      }
      <path class="needle" d="M${CENTRE} ${CENTRE} L${toward(bearing, NEEDLE)}"></path>
      <circle class="hub" cx=${CENTRE} cy=${CENTRE} r="2.5"></circle>
    </svg>`;
  }

  // A press sets the angle where it lands and holds the pointer, so a
  // drag keeps turning the needle wherever it wanders.
  #press = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    const face = event.currentTarget as Element;
    face.setPointerCapture(event.pointerId);
    this.#turn(face, event);
  };

  #drag = (event: PointerEvent): void => {
    const face = event.currentTarget as Element;
    if (face.hasPointerCapture(event.pointerId)) {
      this.#turn(face, event);
    }
  };

  #turn(face: Element, event: PointerEvent): void {
    const bearing = facingToward({ x: CENTRE, y: CENTRE }, pointOn(face, event));
    if (bearing === undefined) {
      return;
    }
    const value = this.view === "above" ? Math.round(bearing) % 360 : Math.round(tiltOf(bearing));
    if (value !== this.value) {
      emit(this, "tw-dial", { value });
    }
  }

  // The value as a bearing on the face: itself from above, and from the
  // side a quarter turn back, since level points right and up is north.
  #bearingOf(value: number): number {
    return this.view === "above" ? value : 90 - value;
  }
}

// The tilt a bearing on the side's face stands for: up is 90 and down is
// -90, and a bearing behind the face takes the nearer of the two.
function tiltOf(bearing: number): number {
  if (bearing <= 180) {
    return 90 - bearing;
  }
  return bearing >= 270 ? 90 : -90;
}

// The point `reach` from the centre toward `bearing`, as a path writes it.
function toward(bearing: number, reach: number): string {
  const way = aimVector(bearing);
  return `${CENTRE + way.x * reach} ${CENTRE + way.y * reach}`;
}

customElements.define("tw-dial", TwDial);

declare global {
  interface HTMLElementTagNameMap {
    "tw-dial": TwDial;
  }
  interface HTMLElementEventMap {
    "tw-dial": CustomEvent<{ value: number }>;
  }
}
