/**
 * ─ The numbers layer ─
 *
 * The DM's Topology view drawn: every cell that has a height prints it,
 * a level change prints "stair", each on a wash of its own so the number
 * reads as dark ink on light rather than as one more mark over the art.
 * Only the cells in view are drawn, and the text objects are kept and
 * reused, since a map is thousands of cells and Pixi text is not cheap.
 * Design: docs/design.md §5 "Height is displayed per scene".
 */

import { Container, Graphics, Text } from "pixi.js";
import type { CellExtent } from "../grid/grid-lines.js";
import type { SquareGrid } from "../grid/square-grid.js";
import type { PackedColor } from "../theme/css-color.js";
import type { Topology } from "./derive.js";
import { cellNumbers } from "./numbers.js";

/** The colours the numbers view draws in; all of them the board's own. */
export interface NumbersStyle {
  /** The board's ground, printed as ink over the washes. */
  readonly ground: number;
  /** Ground above zero and below it: the wash behind a height. */
  readonly up: PackedColor;
  readonly down: PackedColor;
  /** A level change: the wash behind "stair". */
  readonly stair: PackedColor;
  /** The face a measured figure is set in; the theme bridge supplies it. */
  readonly face: string;
}

const DEFAULT_STYLE: NumbersStyle = {
  face: "ui-monospace, monospace",
  ground: 0x1b1d24,
  up: { rgb: 0xe4c57a, alpha: 1 },
  down: { rgb: 0x5fa8bd, alpha: 1 },
  stair: { rgb: 0xc9a24e, alpha: 1 },
};

// The wash under a number, by how far the ground is from level: enough to
// read at a foot, deepening with the drop or the rise, and never so solid
// that the picture beneath is gone.
const WASH_BASE = 0.12;
const WASH_PER_UNIT = 0.012;
const WASH_MOST = 0.45;
const STAIR_WASH = 0.35;
// The ink, and its size as a fraction of the cell: bigger than the edge
// tag's, since this is meant to be read rather than glanced at.
const INK_ALPHA = 0.75;
const TEXT_FRACTION = 0.3;
const TEXT_LEAST = 9;
// The wash stops short of the grid lines, so the cells stay separate.
const WASH_INSET = 0.04;

/** What the layer last drew, for the debug view and the stories. */
export interface NumbersDrawing {
  /** Cells printing a height. */
  readonly heights: number;
  /** Cells printing "stair". */
  readonly stairs: number;
}

/** Prints the rules' reading in every cell that has one. */
export class NumbersLayer {
  private readonly view = new Container({ label: "numbers" });
  private readonly washes = new Graphics();
  private readonly labels = new Container({ label: "numbers-text" });
  private readonly pool: Text[] = [];
  private style: NumbersStyle = DEFAULT_STYLE;
  private counts: NumbersDrawing = { heights: 0, stairs: 0 };

  constructor(container: Container) {
    this.view.visible = false;
    this.view.addChild(this.washes, this.labels);
    container.addChild(this.view);
  }

  /** Print `topology`'s readings over the cells of `extent`. */
  draw(topology: Topology, grid: SquareGrid, extent: CellExtent): void {
    const numbers = cellNumbers(topology, extent);
    const cell = grid.cellSize;
    const size = Math.max(TEXT_LEAST, Math.round(cell * TEXT_FRACTION));
    const inset = cell * WASH_INSET;
    this.washes.clear();
    let heights = 0;
    let stairs = 0;
    for (const [index, number] of numbers.entries()) {
      const x = grid.originX + number.cell.col * cell;
      const y = grid.originY + number.cell.row * cell;
      const wash = this.washOf(number.isLevelChange, number.height);
      this.washes
        .rect(x + inset, y + inset, cell - inset * 2, cell - inset * 2)
        .fill({ color: wash.rgb, alpha: wash.alpha });
      const label = this.labelAt(index);
      label.text = number.text;
      label.style.fontSize = size;
      label.style.fill = this.style.ground;
      label.position.set(x + cell / 2, y + cell / 2);
      label.visible = true;
      if (number.isLevelChange) {
        stairs += 1;
      } else {
        heights += 1;
      }
    }
    for (let index = numbers.length; index < this.pool.length; index += 1) {
      const spare = this.pool[index];
      if (spare !== undefined) {
        spare.visible = false;
      }
    }
    this.counts = { heights, stairs };
    this.view.visible = true;
  }

  /** What was last drawn. */
  drawing(): NumbersDrawing {
    return this.view.visible ? this.counts : { heights: 0, stairs: 0 };
  }

  /** Take the numbers off the board, keeping the text objects for next time. */
  clear(): void {
    this.washes.clear();
    for (const label of this.pool) {
      label.visible = false;
    }
    this.view.visible = false;
    this.counts = { heights: 0, stairs: 0 };
  }

  setStyle(style: NumbersStyle): void {
    this.style = style;
  }

  destroy(): void {
    this.view.destroy({ children: true });
    this.pool.length = 0;
  }

  // A rise is warm and a drop cool, as the washed display has them; a level
  // change is the brass of a worked thing, whatever height it slopes through.
  private washOf(isLevelChange: boolean, height: number): PackedColor {
    if (isLevelChange) {
      return { rgb: this.style.stair.rgb, alpha: STAIR_WASH };
    }
    const band = height > 0 ? this.style.up : this.style.down;
    const alpha = Math.min(WASH_MOST, WASH_BASE + Math.abs(height) * WASH_PER_UNIT);
    return { rgb: band.rgb, alpha };
  }

  // One text object per cell printed, kept and reused: a map is thousands of
  // cells, and making and destroying that many every camera change is the
  // whole cost of this view.
  private labelAt(index: number): Text {
    const existing = this.pool[index];
    if (existing !== undefined) {
      return existing;
    }
    const label = new Text({
      text: "",
      style: { fontFamily: this.style.face, fontWeight: "600", align: "center" },
    });
    label.anchor.set(0.5);
    label.alpha = INK_ALPHA;
    this.pool.push(label);
    this.labels.addChild(label);
    return label;
  }
}
