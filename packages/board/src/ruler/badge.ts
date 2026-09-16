/**
 * ─ Badge ─
 *
 * One line of figures beside a point on the board, on a pill of the
 * ground's darkness: the measure's number and the area's description
 * both read this way, so both draw through this.
 * Design: docs/design.md §5 "Measuring is its own tool".
 */

import { Container, Graphics, Text } from "pixi.js";
import type { Point } from "../geometry.js";

// The figures' size and the pill's padding, as shares of a cell.
const BADGE_FRACTION = 0.26;
const PAD_FRACTION = 0.12;
const OFFSET_FRACTION = 0.55;
const LEAST_SIZE = 11;
const PILL_ALPHA = 0.8;

/** Where the figures were set, for a caller that sets more beside them. */
export interface BadgePlace {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly width: number;
}

/** The text style a badge sets its figures in. */
export function figuresStyle(face: string): {
  fontFamily: string;
  fontWeight: "600";
  align: "left";
} {
  return { fontFamily: face, fontWeight: "600", align: "left" };
}

/** Figures on a pill, set beside a point. */
export class Badge {
  readonly view = new Container();
  readonly figures: Text;
  private readonly pill = new Graphics();

  constructor(face: string) {
    this.figures = new Text({ text: "", style: figuresStyle(face) });
    this.view.addChild(this.pill, this.figures);
  }

  setFace(face: string): void {
    this.figures.style.fontFamily = face;
  }

  /** The line on show, or nothing. */
  get text(): string {
    return this.figures.text;
  }

  clear(): void {
    this.pill.clear();
    this.figures.text = "";
  }

  /**
   * Set `said` up and to the right of `anchor`, in `colour` on `ground`.
   * `follow` sets whatever else belongs on the line after the figures and
   * says how wide it is, so the pill covers it too.
   */
  show(
    anchor: Point,
    cell: number,
    said: string,
    colour: number,
    ground: number,
    follow?: (place: BadgePlace) => number
  ): void {
    const size = Math.max(LEAST_SIZE, Math.round(cell * BADGE_FRACTION));
    this.figures.text = said;
    this.figures.style.fontSize = size;
    this.figures.style.fill = colour;
    const pad = cell * PAD_FRACTION;
    const x = anchor.x + cell * OFFSET_FRACTION;
    const y = anchor.y - cell * OFFSET_FRACTION - this.figures.height;
    this.figures.position.set(x, y);
    const width = this.figures.width;
    const extra = follow?.({ x, y, size, width }) ?? 0;
    this.pill
      .clear()
      .roundRect(x - pad, y - pad, width + extra + pad * 2, this.figures.height + pad * 2, pad)
      .fill({ color: ground, alpha: PILL_ALPHA });
  }
}
