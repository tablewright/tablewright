/**
 * ─ Grid lines ─
 *
 * Positions of the lines that outline a rectangle of cells. Pure:
 * the layer turns these numbers into strokes, and the camera
 * narrows the extent to the cells actually on screen.
 * Design: docs/design.md §5, engine/skin split.
 */

import type { SquareGrid } from "./square-grid.js";

/** A rectangle of cells starting at (colMin, rowMin) and spanning cols x rows. */
export interface CellExtent {
  readonly colMin: number;
  readonly rowMin: number;
  readonly cols: number;
  readonly rows: number;
}

export interface GridLines {
  /** World x of each vertical line, left to right. */
  readonly xs: readonly number[];
  /** World y of each horizontal line, top to bottom. */
  readonly ys: readonly number[];
  /** World bounds the lines span, so every stroke starts and stops on the outline. */
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Lines outlining `extent` on `grid`: one more line than cells on each axis. */
export function gridLines(grid: SquareGrid, extent: CellExtent): GridLines {
  const left = grid.originX + extent.colMin * grid.cellSize;
  const top = grid.originY + extent.rowMin * grid.cellSize;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let c = 0; c <= extent.cols; c += 1) {
    xs.push(left + c * grid.cellSize);
  }
  for (let r = 0; r <= extent.rows; r += 1) {
    ys.push(top + r * grid.cellSize);
  }
  return {
    xs,
    ys,
    left,
    top,
    right: left + extent.cols * grid.cellSize,
    bottom: top + extent.rows * grid.cellSize,
  };
}
