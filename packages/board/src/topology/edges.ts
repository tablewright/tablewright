/**
 * ─ Edges ─
 *
 * Every edge between two cells has one name: the cell on its west or
 * north side, and which of that cell's sides it is. Walls and
 * thresholds are stored under that name, so the two cells an edge
 * separates always find the same entry.
 * Design: docs/design.md §5 "Topology and measurement".
 */

import type { CellRect, Edge } from "@tablewright/schema";
import type { Cell } from "../grid/square-grid.js";

/** The key an edge is stored under. */
export function edgeKey(edge: Edge): string {
  return `${edge.side}:${edge.col}:${edge.row}`;
}

/** The edge between two cells that share a side, or undefined when they share none. */
export function edgeBetween(a: Cell, b: Cell): Edge | undefined {
  if (b.row === a.row) {
    if (b.col === a.col + 1) {
      return { col: a.col, row: a.row, side: "east" };
    }
    if (b.col === a.col - 1) {
      return { col: b.col, row: b.row, side: "east" };
    }
  }
  if (b.col === a.col) {
    if (b.row === a.row + 1) {
      return { col: a.col, row: a.row, side: "south" };
    }
    if (b.row === a.row - 1) {
      return { col: b.col, row: b.row, side: "south" };
    }
  }
  return undefined;
}

/** The two cells an edge separates: the one that names it, then its neighbour. */
export function edgeCells(edge: Edge): [Cell, Cell] {
  const near = { col: edge.col, row: edge.row };
  return edge.side === "east"
    ? [near, { col: edge.col + 1, row: edge.row }]
    : [near, { col: edge.col, row: edge.row + 1 }];
}

/** The edges around a block of cells: a wall rect draws all four sides at once. */
export function rectEdges(rect: CellRect): Edge[] {
  const edges: Edge[] = [];
  for (let col = rect.col0; col <= rect.col1; col += 1) {
    edges.push({ col, row: rect.row0 - 1, side: "south" }, { col, row: rect.row1, side: "south" });
  }
  for (let row = rect.row0; row <= rect.row1; row += 1) {
    edges.push({ col: rect.col0 - 1, row, side: "east" }, { col: rect.col1, row, side: "east" });
  }
  return edges;
}
