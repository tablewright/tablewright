/**
 * ─ What a box touches ─
 *
 * A box dragged out with Select picks whatever it touches: a token when
 * any of the box falls in its cell, the template when the box and its
 * footprint share a point. A click is a box with no size, so the two
 * gestures answer to one rule. All in cells, the grid's own measure.
 * Design: docs/templates.md "The Select tool".
 */

import type { Outline } from "../area/outline.js";
import type { Cell } from "../grid/square-grid.js";
import { segmentsMeet, type Point } from "../shared/geometry.js";
import type { TokenView } from "../tokens/token-layer.js";
import { pointInPolygon } from "../topology/shapes.js";
import { THE_AREA, tokenThing, type Thing } from "./picked.js";

/** A box dragged out on the board, in cells: the corner pressed and the corner let go, either way round. */
export interface PickBox {
  readonly from: Point;
  readonly to: Point;
}

/**
 * What `box` touches, in the order a pick takes them: each of `tokens`
 * whose cell it touches, in the order given, then the template if it
 * touches `footprint`.
 */
export function boxHits(
  box: PickBox,
  tokens: readonly Pick<TokenView, "id" | "cell">[],
  footprint: Outline | undefined
): Thing[] {
  const hits = tokens
    .filter((token) => touchesCell(box, token.cell))
    .map((token) => tokenThing(token.id));
  if (footprint !== undefined && touchesOutline(box, footprint)) {
    hits.push(THE_AREA);
  }
  return hits;
}

/**
 * What a click at `at` picks: the token on that cell, first in the order
 * given, else the template if its footprint holds the point.
 */
export function clickHit(
  at: Point,
  tokens: readonly Pick<TokenView, "id" | "cell">[],
  footprint: Outline | undefined
): Thing | undefined {
  return boxHits({ from: at, to: at }, tokens, footprint)[0];
}

// The box's own edges, from the lowest corner to the highest.
function sides(box: PickBox): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.min(box.from.x, box.to.x),
    top: Math.min(box.from.y, box.to.y),
    right: Math.max(box.from.x, box.to.x),
    bottom: Math.max(box.from.y, box.to.y),
  };
}

// The box touches every cell one of its points falls in, as a point on a
// line between two cells falls in the one right of it or below.
function touchesCell(box: PickBox, cell: Cell): boolean {
  const { left, top, right, bottom } = sides(box);
  return (
    cell.col >= Math.floor(left) &&
    cell.col <= Math.floor(right) &&
    cell.row >= Math.floor(top) &&
    cell.row <= Math.floor(bottom)
  );
}

function holds(box: PickBox, point: Point): boolean {
  const { left, top, right, bottom } = sides(box);
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

// Two shapes share a point when an edge of one crosses an edge of the
// other, or else when one holds a point of the other: here a corner of the
// box inside the ring and out of its hole, or a point of either loop
// inside the box.
function touchesOutline(box: PickBox, outline: Outline): boolean {
  const { ring, hole } = outline;
  if (ring.length < 3) {
    return false;
  }
  const loops = hole === undefined ? [ring] : [ring, hole];
  if (loops.some((loop) => loop.some((point) => holds(box, point)))) {
    return true;
  }
  const { left, top, right, bottom } = sides(box);
  const corners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  const isIn = (point: Point): boolean =>
    pointInPolygon(point, ring) && (hole === undefined || !pointInPolygon(point, hole));
  if (corners.some(isIn)) {
    return true;
  }
  return loops.some((loop) =>
    loop.some((a, i) => {
      const b = loop[(i + 1) % loop.length];
      return (
        b !== undefined &&
        corners.some((p, j) => {
          const q = corners[(j + 1) % corners.length];
          return q !== undefined && segmentsMeet(p, q, a, b) !== undefined;
        })
      );
    })
  );
}
