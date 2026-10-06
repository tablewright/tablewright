/**
 * ─ Measure view ─
 *
 * A measurement drawn on the board, without the gesture that made it.
 * As a line: the crow-flies distance, faint past where the line of
 * effect breaks. As a path: the way on foot, coloured by how much of
 * the turn's movement each step has spent, and dashed where it drops.
 * One badge beside the far end carries the number. The ruler and a
 * token's drag both show their answer through this.
 * Design: docs/design.md §5 "Measuring is its own tool".
 */

import { CanvasTextMetrics, Container, Graphics, Text } from "pixi.js";
import { dashedLine } from "../draw/strokes.js";
import { along, lengthOf, type Point } from "../shared/geometry.js";
import { keptAlpha } from "../shared/seen.js";
import { cellCenter, cellPointToWorld, type SquareGrid } from "../grid/square-grid.js";
import { FALLBACK } from "../theme/board-theme.js";
import type { PackedColor } from "../theme/css-color.js";
import { rulerStyle } from "../theme/styles.js";
import { Badge, figuresStyle } from "./badge.js";
import type { Measurement } from "./measure.js";
import { badgeText, FALL_MARK, RISE_MARK, type RulerMode } from "./mode.js";

export interface RulerStyle {
  /** The line or the way, its ends, its arrow and the badge text. */
  readonly line: PackedColor;
  /** The way past what the movement reaches but within a dash: the tokens' brass. */
  readonly dash: PackedColor;
  /** The way past even a dash: the one red on the board. */
  readonly beyond: PackedColor;
  /** The pill under the badge. */
  readonly ground: number;
  /** The face a measured figure is set in; the theme bridge supplies it. */
  readonly face: string;
  /** The face the rise mark falls through to, behind the figures' own. */
  readonly marks: string;
}

interface StrokeOptions {
  /** Past a break in the line of effect: the same colour, thinned to a hint. */
  readonly isFaint?: boolean;
  /** A drop: the step is dashed. */
  readonly isDashed?: boolean;
}

const DEFAULT_STYLE: RulerStyle = rulerStyle(FALLBACK);

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
// Where each face puts the middle of what it draws, above the baseline and
// as a share of the size, measured off the two files in packages/ui/fonts.
// An icon fills its square and a figure only reaches its cap, so laid on
// one baseline the mark rides high by the difference between these.
const MARK_MIDDLE = 0.491;
const FIGURE_MIDDLE = 0.344;

/** Draws one measurement into a container, in the mode it is read in. */
export class MeasureView {
  private readonly view = new Container();
  private readonly graphics = new Graphics();
  private readonly badge = new Badge(DEFAULT_STYLE.face);
  // The mark is set apart from the figures so it can be brought down onto
  // their middle; the tail is whatever the badge says after it.
  private readonly mark: Text;
  private readonly tail: Text;
  private grid: SquareGrid;
  private style: RulerStyle = DEFAULT_STYLE;

  constructor(container: Container, grid: SquareGrid) {
    this.grid = grid;
    this.tail = new Text({ text: "", style: figuresStyle(DEFAULT_STYLE.face) });
    this.mark = new Text({
      text: "",
      style: figuresStyle(`${DEFAULT_STYLE.face}, ${DEFAULT_STYLE.marks}`),
    });
    this.view.addChild(this.graphics, this.badge.view, this.mark, this.tail);
    this.view.visible = false;
    container.addChild(this.view);
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
  }

  setStyle(style: RulerStyle): void {
    this.style = style;
    this.badge.setFace(style.face);
    this.tail.style.fontFamily = style.face;
    this.mark.style.fontFamily = `${style.face}, ${style.marks}`;
  }

  /** Draw `measurement` as `mode` reads it, in place of whatever showed before. */
  show(measurement: Measurement, mode: RulerMode): void {
    const g = this.graphics;
    g.clear();
    this.view.visible = true;
    // One that is not the whole table's reads fainter throughout; the badge
    // says which of the two it is.
    this.view.alpha = keptAlpha(measurement.seenBy);
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
    this.badge.clear();
    this.mark.text = "";
    this.tail.text = "";
    this.view.visible = false;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

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
    const cut = shown.blockedAt === undefined ? base : cellPointToWorld(this.grid, shown.blockedAt);
    this.strokeLine(g, near, cut, line);
    if (isBroken) {
      this.strokeLine(g, cut, base, line, { isFaint: true });
      this.bar(g, near, far, cut, line);
    }
    this.arrowhead(g, near, far, line, isBroken);
  }

  // Refused, the shortest way still shows so the badge has a number.
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

  // One number beside the far end. The badge is one line read in two faces:
  // the figures in theirs, and the rise or fall in the one that has an
  // arrow. Cut at the mark so the mark can be set down onto the figures'
  // middle; with no mark to find, the whole line is figures.
  private drawBadge(shown: Measurement, mode: RulerMode): void {
    const said = badgeText(shown, mode);
    const rise = said.indexOf(RISE_MARK);
    const at = rise < 0 ? said.indexOf(FALL_MARK) : rise;
    this.mark.text = at < 0 ? "" : said.slice(at, at + 1);
    this.tail.text = at < 0 ? "" : said.slice(at + 1);
    const colour = this.style.line.rgb;
    this.badge.show(
      cellCenter(this.grid, shown.to),
      this.grid.cellSize,
      at < 0 ? said : said.slice(0, at),
      colour,
      this.style.ground,
      ({ x, y, size, width }) => {
        for (const part of [this.mark, this.tail]) {
          part.style.fontSize = size;
          part.style.fill = colour;
        }
        this.mark.position.set(x + width, y + this.markDrop(size));
        this.tail.position.set(x + width + this.mark.width, y);
        return this.mark.width + this.tail.width;
      }
    );
  }

  // The two faces carry different ascents, so the mark drops by the gap
  // between its middle and a figure's.
  private markDrop(size: number): number {
    if (this.mark.text === "") {
      return 0;
    }
    const ascent = (part: Text, standIn: string): number =>
      CanvasTextMetrics.measureText(part.text === "" ? standIn : part.text, part.style)
        .fontProperties.ascent;
    return (
      ascent(this.badge.figures, "0") -
      ascent(this.mark, RISE_MARK) +
      (MARK_MIDDLE - FIGURE_MIDDLE) * size
    );
  }

  private dot(g: Graphics, at: Point, color: PackedColor): void {
    g.circle(at.x, at.y, this.grid.cellSize * END_FRACTION).fill({
      color: color.rgb,
      alpha: color.alpha,
    });
  }

  // A short bar across the line at `at`: where the line of effect breaks.
  private bar(g: Graphics, from: Point, to: Point, at: Point, color: PackedColor): void {
    const length = lengthOf(from, to);
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
    const length = lengthOf(from, to);
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
    const length = lengthOf(from, to);
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
    const dash = this.grid.cellSize * DASH_FRACTION;
    dashedLine(g, from, to, dash, dash);
    g.stroke(style);
  }

  private lineWidth(): number {
    return Math.max(2, this.grid.cellSize * LINE_FRACTION);
  }
}
