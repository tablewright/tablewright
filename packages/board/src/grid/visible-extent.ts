import type { CellExtent } from "./grid-lines.js";
import type { SquareGrid } from "./square-grid.js";

/** An axis-aligned rectangle in world pixels. */
export interface WorldRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The cells of `bounds` that touch `view`, or undefined when none do. */
export function visibleExtent(
  grid: SquareGrid,
  view: WorldRect,
  bounds: CellExtent
): CellExtent | undefined {
  const colMin = Math.max(bounds.colMin, Math.floor((view.left - grid.originX) / grid.cellSize));
  const rowMin = Math.max(bounds.rowMin, Math.floor((view.top - grid.originY) / grid.cellSize));
  const colEnd = Math.min(
    bounds.colMin + bounds.cols,
    Math.ceil((view.right - grid.originX) / grid.cellSize)
  );
  const rowEnd = Math.min(
    bounds.rowMin + bounds.rows,
    Math.ceil((view.bottom - grid.originY) / grid.cellSize)
  );
  if (colEnd <= colMin || rowEnd <= rowMin) {
    return undefined;
  }
  return { colMin, rowMin, cols: colEnd - colMin, rows: rowEnd - rowMin };
}
