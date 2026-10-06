import type { WorldRect } from "../shared/geometry.js";
import { intersectExtents, type CellExtent } from "./grid-lines.js";
import { worldToCellPoint, type SquareGrid } from "./square-grid.js";

/** The cells of `bounds` that touch `view`, or undefined when none do. */
export function visibleExtent(
  grid: SquareGrid,
  view: WorldRect,
  bounds: CellExtent
): CellExtent | undefined {
  const near = worldToCellPoint(grid, { x: view.left, y: view.top });
  const far = worldToCellPoint(grid, { x: view.right, y: view.bottom });
  const colMin = Math.floor(near.x);
  const rowMin = Math.floor(near.y);
  return intersectExtents(bounds, {
    colMin,
    rowMin,
    cols: Math.ceil(far.x) - colMin,
    rows: Math.ceil(far.y) - rowMin,
  });
}

/** The cells, from the grid origin, needed to cover `width` x `height` world pixels. */
export function extentCovering(grid: SquareGrid, width: number, height: number): CellExtent {
  return {
    colMin: 0,
    rowMin: 0,
    cols: Math.max(0, Math.ceil(width / grid.cellSize)),
    rows: Math.max(0, Math.ceil(height / grid.cellSize)),
  };
}
