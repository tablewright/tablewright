/**
 * ─ A free placement ─
 *
 * Several things moved together land where they are put: each picked
 * token on its own cell carried the same whole cells, with no way found,
 * no movement counted and no wall asked, and the template's origin carried
 * as far. One token alone keeps its rules; that is the token layer's own
 * drag, not this.
 * Design: docs/templates.md "The Select tool".
 */

import type { Cell } from "../grid/square-grid.js";
import type { Point } from "../shared/geometry.js";

/** How far a placement carries what is picked: whole cells across and down. */
export interface Offset {
  readonly cols: number;
  readonly rows: number;
}

// Arrow keys and WASD both step what is picked one cell.
const STEPS: Readonly<Record<string, Offset>> = {
  ArrowUp: { cols: 0, rows: -1 },
  ArrowDown: { cols: 0, rows: 1 },
  ArrowLeft: { cols: -1, rows: 0 },
  ArrowRight: { cols: 1, rows: 0 },
  w: { cols: 0, rows: -1 },
  s: { cols: 0, rows: 1 },
  a: { cols: -1, rows: 0 },
  d: { cols: 1, rows: 0 },
  W: { cols: 0, rows: -1 },
  S: { cols: 0, rows: 1 },
  A: { cols: -1, rows: 0 },
  D: { cols: 1, rows: 0 },
};

/** The step a key takes what is picked, if it is an arrow or one of WASD. */
export function stepOf(key: string): Offset | undefined {
  return STEPS[key];
}

/**
 * How far a drag from `from` to `to`, both in cells, carries what is
 * picked: its travel rounded to whole cells, so the set moves a cell once
 * the pointer has gone half of one, wherever in a cell the press landed.
 */
export function offsetOf(from: Point, to: Point): Offset {
  return { cols: whole(to.x - from.x), rows: whole(to.y - from.y) };
}

// Rounded, and never a negative nought for a drag that went nowhere.
function whole(cells: number): number {
  return Math.round(cells) + 0;
}

/** Whether `offset` carries nothing anywhere. */
export function isStill(offset: Offset): boolean {
  return offset.cols === 0 && offset.rows === 0;
}

/** Whether two offsets carry the same way. */
export function sameOffset(a: Offset, b: Offset): boolean {
  return a.cols === b.cols && a.rows === b.rows;
}

/** The cell `offset` carries `cell` to. */
export function carriedCell(cell: Cell, offset: Offset): Cell {
  return { col: cell.col + offset.cols, row: cell.row + offset.rows };
}

/**
 * A place on the plan carried `offset`, where `cell` is how long a cell
 * is in the place's own unit: a template's origin, which sits in the
 * rule's unit rather than in cells.
 */
export function carriedPoint(at: Point, offset: Offset, cell: number): Point {
  return { x: at.x + offset.cols * cell, y: at.y + offset.rows * cell };
}

/**
 * `tokens` as they stand once the tokens `ids` are carried `offset`, the
 * rest where they are, in the order given.
 */
export function standingAfter<T extends { readonly id: string; readonly cell: Cell }>(
  tokens: readonly T[],
  ids: ReadonlySet<string>,
  offset: Offset
): T[] {
  return tokens.map((token) =>
    ids.has(token.id) ? { ...token, cell: carriedCell(token.cell, offset) } : token
  );
}
