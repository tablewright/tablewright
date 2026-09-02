/**
 * ─ Pinch math ─
 *
 * Two pointers moving between frames become one camera step: pan by
 * how far their midpoint moved, then zoom about the new midpoint by
 * how much their separation changed. Applying the two in that order
 * keeps the world under the fingers still.
 */

import type { Point } from "../geometry.js";

export interface PinchStep {
  /** Screen point to zoom about after panning: the new midpoint. */
  readonly anchor: Point;
  /** Zoom multiplier from the change in finger separation. */
  readonly factor: number;
  /** Screen-space pan from the midpoint's travel. */
  readonly dx: number;
  readonly dy: number;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function separation(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The camera step for two pointers that moved from `prev` to `next`. */
export function pinchStep(prev: readonly [Point, Point], next: readonly [Point, Point]): PinchStep {
  const before = midpoint(prev[0], prev[1]);
  const after = midpoint(next[0], next[1]);
  const spread = separation(prev[0], prev[1]);
  // Two pointers on one spot have no separation to compare; treat as pure pan.
  const factor = spread === 0 ? 1 : separation(next[0], next[1]) / spread;
  return { anchor: after, factor, dx: after.x - before.x, dy: after.y - before.y };
}
