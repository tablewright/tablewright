/**
 * ─ What an area catches ─
 *
 * Which cells an area takes, and which tokens stand in them. A cell is
 * caught when the volume holds the centre of that cell's cube, and then
 * everything standing in the cell is caught: one test in three
 * dimensions rather than a family of grid rules. The rule is named so a
 * system that counts differently can bring its own.
 * Design: docs/design.md §5 "A cell is caught when the volume holds the
 * centre of its cube".
 */

import type { CellExtent } from "../grid/grid-lines.js";
import type { Cell } from "../grid/square-grid.js";
import type { TokenView } from "../tokens/token-layer.js";
import { heightAt, type Topology } from "../topology/derive.js";
import type { CoverRule } from "@tablewright/schema";
import type { GridRule } from "../topology/distance.js";
import { cubeCentre, type Area, type Spot } from "./area.js";
import { holds } from "./volume.js";

// The place in a cell the rule asks about. A second rule joins here
// rather than at every call site.
function testPoint(cover: CoverRule, cell: Cell, ground: number, rule: GridRule): Spot {
  switch (cover) {
    case "cube-centre":
    default:
      return cubeCentre(cell, ground, rule);
  }
}

/** How high a token stands: the ground under it, and what it holds above that floor. */
export function placeOf(token: TokenView): number {
  return (token.height ?? 0) + (token.elevation ?? 0);
}

/** Whether `area` catches `cell`, by the campaign's cover rule. */
export function catchesCell(
  area: Area,
  origin: Spot,
  cell: Cell,
  topology: Topology,
  rule: GridRule
): boolean {
  return holds(area, origin, testPoint(rule.cover, cell, heightAt(topology, cell), rule));
}

/**
 * Whether `area` catches `token` where it stands. A token is judged by
 * the cube it occupies, which sits at the ground under it plus whatever
 * it holds above that floor, so a flier is not caught by what washes
 * the ground beneath them.
 */
export function catchesToken(area: Area, origin: Spot, token: TokenView, rule: GridRule): boolean {
  return holds(area, origin, testPoint(rule.cover, token.cell, placeOf(token), rule));
}

/**
 * The cells `area` catches, in row order. Only the cells the area could
 * possibly reach are asked about, so a small template over a large map
 * costs what it covers rather than what the map holds.
 */
export function caughtCells(
  area: Area,
  origin: Spot,
  topology: Topology,
  rule: GridRule,
  extent: CellExtent = topology.bounds
): Cell[] {
  const box = clip(reachBox(area, origin, rule), extent);
  const cells: Cell[] = [];
  if (box === undefined) {
    return cells;
  }
  for (let row = box.rowMin; row < box.rowMin + box.rows; row += 1) {
    for (let col = box.colMin; col < box.colMin + box.cols; col += 1) {
      const cell = { col, row };
      if (catchesCell(area, origin, cell, topology, rule)) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

// The furthest an area reaches across the map, as a box of cells around
// its origin. A flat-edged cone overshoots its length at the corners, so
// it is given the room it actually takes.
function reachBox(area: Area, origin: Spot, rule: GridRule): CellExtent {
  const reach = flatReach(area);
  const cells = Math.ceil(reach / rule.cellSize) + 1;
  const colMin = Math.floor(origin.x / rule.cellSize) - cells;
  const rowMin = Math.floor(origin.y / rule.cellSize) - cells;
  return { colMin, rowMin, cols: cells * 2 + 1, rows: cells * 2 + 1 };
}

function flatReach(area: Area): number {
  switch (area.kind) {
    case "line":
      return area.length + area.width;
    case "cone": {
      const half = ((area.spread / 2) * Math.PI) / 180;
      return area.edge === "flat" ? area.length / Math.max(Math.cos(half), 1e-6) : area.length;
    }
    default:
      return area.radius;
  }
}

function clip(box: CellExtent, extent: CellExtent): CellExtent | undefined {
  const colMin = Math.max(box.colMin, extent.colMin);
  const rowMin = Math.max(box.rowMin, extent.rowMin);
  const colEnd = Math.min(box.colMin + box.cols, extent.colMin + extent.cols);
  const rowEnd = Math.min(box.rowMin + box.rows, extent.rowMin + extent.rows);
  if (colEnd <= colMin || rowEnd <= rowMin) {
    return undefined;
  }
  return { colMin, rowMin, cols: colEnd - colMin, rows: rowEnd - rowMin };
}
