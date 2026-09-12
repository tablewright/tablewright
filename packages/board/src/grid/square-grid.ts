/**
 * ─ Square grid ─
 *
 * Pure coordinate math between world pixels and grid cells. A grid is a
 * lattice of `cellSize` squares whose origin can be offset so the lines
 * land on a map image's own grid. Nothing here touches Pixi or the
 * DOM: layers and tools call in and draw what comes back.
 * Design: docs/design.md §5, engine/skin split.
 */

import type { Point } from "../geometry.js";

/** Grid geometry in world pixels. The origin is the top-left corner of cell (0, 0). */
export interface SquareGrid {
  /** Side of one cell in world pixels. Must be positive; the boundary that builds a grid checks. */
  readonly cellSize: number;
  readonly originX: number;
  readonly originY: number;
}

/** A cell address. Columns grow rightward, rows downward; negatives are valid. */
export interface Cell {
  readonly col: number;
  readonly row: number;
}

/** The cell containing a world point. A point on a shared edge belongs to the cell right or below it. */
export function worldToCell(grid: SquareGrid, point: Point): Cell {
  return {
    col: Math.floor((point.x - grid.originX) / grid.cellSize),
    row: Math.floor((point.y - grid.originY) / grid.cellSize),
  };
}

/** Top-left corner of a cell in world pixels. */
export function cellToWorld(grid: SquareGrid, cell: Cell): Point {
  return {
    x: grid.originX + cell.col * grid.cellSize,
    y: grid.originY + cell.row * grid.cellSize,
  };
}

/** Centre of a cell in world pixels, where a one-cell token sits. */
export function cellCenter(grid: SquareGrid, cell: Cell): Point {
  const corner = cellToWorld(grid, cell);
  const half = grid.cellSize / 2;
  return { x: corner.x + half, y: corner.y + half };
}

/** Snap a world point to the centre of the cell it falls in. */
export function snapToCellCenter(grid: SquareGrid, point: Point): Point {
  return cellCenter(grid, worldToCell(grid, point));
}

/** A world point in cell coordinates, fractions and all: the grid's own measure. */
export function worldToCellPoint(grid: SquareGrid, point: Point): Point {
  return {
    x: (point.x - grid.originX) / grid.cellSize,
    y: (point.y - grid.originY) / grid.cellSize,
  };
}
