/**
 * ─ The numbers view ─
 *
 * What the Topology view prints in each cell: the height the rules read
 * there, or "stair" where a level change is walked instead of climbed.
 * A cell at ground level says nothing, so the numbers mark what is
 * unusual rather than covering the map. This is the reading, not the
 * drawing: the layer beside it puts these on the board.
 * Design: docs/design.md §5 "Height is displayed per scene".
 */

import { signed } from "../draw/tool.js";
import type { CellExtent } from "../grid/grid-lines.js";
import type { Cell } from "../grid/square-grid.js";
import { heightAt, isLevelChangeAt, type Topology } from "./derive.js";

/** What a level change prints instead of a height, as the mock names it. */
export const STAIR = "stair";

/** One cell's reading in the Topology view. */
export interface CellNumber {
  readonly cell: Cell;
  /** What the cell prints: a height with its sign, or `STAIR`. */
  readonly text: string;
  /** The height the rules read there, rounded; the wash behind the text follows it. */
  readonly height: number;
  readonly isLevelChange: boolean;
}

/**
 * The readings over `extent`, in row order, skipping every cell that has
 * nothing to say. The height is the field at the cell's centre, which is
 * what the rules read, rounded to the unit the board shows.
 */
export function cellNumbers(topology: Topology, extent: CellExtent): CellNumber[] {
  const numbers: CellNumber[] = [];
  for (let row = extent.rowMin; row < extent.rowMin + extent.rows; row += 1) {
    for (let col = extent.colMin; col < extent.colMin + extent.cols; col += 1) {
      const cell = { col, row };
      const isLevelChange = isLevelChangeAt(topology, cell);
      const height = Math.round(heightAt(topology, cell));
      if (height === 0 && !isLevelChange) {
        continue;
      }
      numbers.push({
        cell,
        text: isLevelChange ? STAIR : signed(height),
        height,
        isLevelChange,
      });
    }
  }
  return numbers;
}
