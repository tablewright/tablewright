/**
 * ─ Measure view ─
 *
 * A measurement drawn on the board, without the gesture that made it.
 * As a line: the crow-flies distance with an arrow at the far end, a bar
 * across it where a wall or a shut door breaks the line of effect and the
 * rest faint. As a path: the way on foot, in the plain colour as far as
 * the movement left reaches, brass within a dash, red past even that, and
 * dashed where it drops. One badge beside the far end carries the number.
 * The ruler and a token's drag both show their answer through this.
 * Design: docs/design.md §5 "Measuring is its own tool".
 */

import { Container, Graphics, Text } from "pixi.js";
import type { Point } from "../geometry.js";
import { KEPT_ALPHA } from "../seen.js";
import { cellCenter, type SquareGrid } from "../grid/square-grid.js";
import type { PackedColor } from "../theme/css-color.js";
import type { Measurement } from "./measure.js";
import { badgeText, type RulerMode } from "./mode.js";

export interface RulerStyle {
  /** The line or the way, its ends, its arrow and the badge text. */
  readonly line: PackedColor;
  /** The way past what the movement reaches but within a dash: the tokens' brass. */
  readonly dash: PackedColor;
  /** The way past even a dash: the one red on the board. */
  readonly beyond: PackedColor;
  /** The pill under the badge. */
  readonly ground: number;
}

interface StrokeOptions {
  /** Past a break in the line of effect: the same colour, thinned to a hint. */
  readonly isFaint?: boolean;
  /** A drop: the step is dashed. */
  readonly isDashed?: boolean;
}

const DEFAULT_STYLE: RulerStyle = {
  line: { rgb: 0xf1e6d2, alpha: 1 },
  dash: { rgb: 0xc9a24e, alpha: 1 },
  beyond: { rgb: 0xc8553d, alpha: 1 },
  ground: 0x1b1d24,
};

// Past a break the line keeps its colour at this much of its alpha.
const FAINT_ALPHA = 0.4;
// Fractions of the cell: the line never under two pixels, a dash and its
// gap, the bar across a break, the arrow long enough to read at any zoom
// the grid reads at.
const LINE_FRACTION = 0.05;
const DASH_FRACTION = 0.25;
const BAR_FRACTION = 0.35;
const END_FRACTION = 0.08;
const ARROW_FRACTION = 0.3;
const BADGE_FRACTION = 0.26;
const PILL_ALPHA = 0.8;

/** Draws one measurement into a container, in the mode it is read in. */
export class MeasureView {
  private readonly view = new Container();
  private readonly graphics = new Graphics();
  private readonly pill = new Graphics();
  private readonly badge: Text;
  private grid: SquareGrid;
  private style: RulerStyle = DEFAULT_STYLE;

  constructor(container: Container, grid: SquareGrid) {
    this.grid = grid;
    this.badge = new Text({
      text: "",
      style: { fontFamily: "system-ui, sans-serif", fontWeight: "600", align: "left" },
    });
    this.view.addChild(this.graphics, this.pill, this.badge);
    this.view.visible = false;
    container.addChild(this.view);
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
  }

  setStyle(style: RulerStyle): void {
    this.style = style;
  }

  /** Draw `measurement` as `mode` reads it, in place of whatever showed before. */
  show(measurement: Measurement, mode: RulerMode): void {
    const g = this.graphics;
    g.clear();
    this.pill.clear();
    this.view.visible = true;
    // One that is not the whole table's reads fainter throughout; the badge
    // says which of the two it is.
    this.view.alpha = measurement.seenBy === "party" ? 1 : KEPT_ALPHA;
    if (mode === "path") {
      this.drawPath(g, measurement);
    } else {
      this.drawLine(g, measurement);
    }
    this.drawBadge(measurement, mode);
  }

  /** Take whatever is drawn off the board. */
  clear(): void {
    this.graphics.clear();
    this.pill.clear();
    this.badge.text = "";
    this.view.visible = false;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  // The crow-flies line with an arrow at its far end. Past where the line
  // of effect breaks it goes faint, with a bar across it at the wall.
  private drawLine(g: Graphics, shown: Measurement): void {
    const { line } = this.style;
    const near = cellCenter(this.grid, shown.from);
    const far = cellCenter(this.grid, shown.to);
    this.dot(g, near, line);
    if (near.x === far.x && near.y === far.y) {
      return;
    }
    // The line ends where the head begins, so the head's tip is the true end.
    const base = this.arrowBase(near, far);
    const isBroken = shown.blockedAt !== undefined;
    const cut = shown.blockedAt === undefined ? base : this.world(shown.blockedAt);
    this.strokeLine(g, near, cut, line);
    if (isBroken) {
      this.strokeLine(g, cut, base, line, { isFaint: true });
      this.bar(g, near, far, cut, line);
    }
    this.arrowhead(g, near, far, line, isBroken);
  }

  // The way on foot as the turn offers it, step by step: in the line's
  // colour within what the movement left reaches, brass within a dash,
  // red past even that, and dashed where it drops. Refused, the shortest
  // way shows so the badge has a number to name; no way at all shows the
  // two ends alone.
  private drawPath(g: Graphics, shown: Measurement): void {
    const { line } = this.style;
    const near = cellCenter(this.grid, shown.from);
    const far = cellCenter(this.grid, shown.to);
    this.dot(g, near, line);
    const steps = (shown.choice.route ?? shown.route)?.steps ?? [];
    const centres = steps.map((step) => cellCenter(this.grid, step.cell));
    const last = centres[centres.length - 1];
    const before = centres[centres.length - 2];
    if (last === undefined || before === undefined) {
      if (near.x !== far.x || near.y !== far.y) {
        this.dot(g, far, line);
      }
      return;
    }
    const ends = [...centres.slice(0, -1), this.arrowBase(before, last)];
    for (let i = 1; i < ends.length; i += 1) {
      const from = ends[i - 1];
      const to = ends[i];
      const step = steps[i];
      if (from === undefined || to === undefined || step === undefined) {
        continue;
      }
      this.strokeLine(g, from, to, this.bandOf(step.cost, shown), {
        isDashed: step.kind === "drop",
      });
    }
    const arrival = steps[steps.length - 1];
    this.arrowhead(
      g,
      before,
      last,
      arrival === undefined ? line : this.bandOf(arrival.cost, shown)
    );
  }

  // The colour a step wears by how much movement it has spent.
  private bandOf(spent: number, shown: Measurement): PackedColor {
    const { line, dash, beyond } = this.style;
    if (spent <= shown.reach) {
      return line;
    }
    return spent <= shown.dashReach ? dash : beyond;
  }

  // One number on a pill of the ground's darkness, beside the far end.
  private drawBadge(shown: Measurement, mode: RulerMode): void {
    const cell = this.grid.cellSize;
    const far = cellCenter(this.grid, shown.to);
    this.badge.text = badgeText(shown, mode);
    this.badge.style.fontSize = Math.max(11, Math.round(cell * BADGE_FRACTION));
    this.badge.style.fill = this.style.line.rgb;
    const pad = cell * 0.12;
    const x = far.x + cell * 0.55;
    const y = far.y - cell * 0.55 - this.badge.height;
    this.badge.position.set(x, y);
    this.pill
      .roundRect(x - pad, y - pad, this.badge.width + pad * 2, this.badge.height + pad * 2, pad)
      .fill({ color: this.style.ground, alpha: PILL_ALPHA });
  }

  private dot(g: Graphics, at: Point, color: PackedColor): void {
    g.circle(at.x, at.y, this.grid.cellSize * END_FRACTION).fill({
      color: color.rgb,
      alpha: color.alpha,
    });
  }

  // A short bar across the line at `at`: where the line of effect breaks.
  private bar(g: Graphics, from: Point, to: Point, at: Point, color: PackedColor): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) {
      return;
    }
    const half = (this.grid.cellSize * BAR_FRACTION) / 2;
    const nx = -(to.y - from.y) / length;
    const ny = (to.x - from.x) / length;
    g.moveTo(at.x - nx * half, at.y - ny * half)
      .lineTo(at.x + nx * half, at.y + ny * half)
      .stroke({ width: this.lineWidth(), color: color.rgb, alpha: color.alpha, cap: "round" });
  }

  // Where a line ends and its head begins: one head short of `to`.
  private arrowBase(from: Point, to: Point): Point {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const size = this.grid.cellSize * ARROW_FRACTION;
    return length <= size ? from : along(from, to, 1 - size / length);
  }

  // A filled head pointing from `from` to `to`, its tip at `to`.
  private arrowhead(
    g: Graphics,
    from: Point,
    to: Point,
    color: PackedColor,
    isFaint = false
  ): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) {
      return;
    }
    const ux = (to.x - from.x) / length;
    const uy = (to.y - from.y) / length;
    const size = this.grid.cellSize * ARROW_FRACTION;
    const half = size * 0.5;
    const base = { x: to.x - ux * size, y: to.y - uy * size };
    g.poly(
      [to.x, to.y, base.x - uy * half, base.y + ux * half, base.x + uy * half, base.y - ux * half],
      true
    ).fill({ color: color.rgb, alpha: color.alpha * (isFaint ? FAINT_ALPHA : 1) });
  }

  private strokeLine(
    g: Graphics,
    from: Point,
    to: Point,
    color: PackedColor,
    options: StrokeOptions = {}
  ): void {
    const style = {
      width: this.lineWidth(),
      color: color.rgb,
      alpha: color.alpha * (options.isFaint ? FAINT_ALPHA : 1),
      cap: "round" as const,
    };
    if (!options.isDashed) {
      g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke(style);
      return;
    }
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const dash = this.grid.cellSize * DASH_FRACTION;
    for (let start = 0; start < length; start += dash * 2) {
      const end = Math.min(length, start + dash);
      const a = along(from, to, start / length);
      const b = along(from, to, end / length);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke(style);
  }

  private lineWidth(): number {
    return Math.max(2, this.grid.cellSize * LINE_FRACTION);
  }

  private world(point: Point): Point {
    return {
      x: this.grid.originX + point.x * this.grid.cellSize,
      y: this.grid.originY + point.y * this.grid.cellSize,
    };
  }
}

function along(from: Point, to: Point, t: number): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
