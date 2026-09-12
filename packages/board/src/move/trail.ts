/**
 * ─ Trail ─
 *
 * The way a drag went picks its route. When the safe way and the quick
 * one both sit in the tier this turn offers, the pointer's own path
 * decides between them: the route it hugged wins, with recent motion
 * counting most, so a change of heart part way through flips the choice.
 * A margin keeps the two from swapping back and forth under the hand.
 * Measured in cells, so the same drag picks the same way at any zoom.
 * Design: docs/design.md §5 "Moving shows movement only".
 */

import type { Point } from "../geometry.js";
import { cellCentre } from "../topology/effect.js";
import type { Route, Routes } from "../topology/route.js";

/** Which of the two ways a move takes: the one that never drops, or the shortest. */
export type RoutePreference = "safe" | "quick";

// A point one cell further back along the trail counts half as much. The
// weight goes by the distance dragged, not by the number of points, so a
// fast mouse and a slow one read the same drag the same way.
const DECAY_PER_CELL = 0.5;
// Past this much dragging the trail is forgotten, in cells: by then a point
// carries under a thousandth of the newest one.
const MEMORY = 10;
// How much closer one route must sit before the choice changes, in cells.
const MARGIN = 0.15;
// Below this the trail is a twitch, not a direction.
const ENOUGH = 3;

/**
 * The route the trail follows, or `preference` when neither wins clearly.
 * `trail` is the pointer's path in cell coordinates, oldest first.
 */
export function pickRoute(
  candidates: Routes,
  trail: readonly Point[],
  preference: RoutePreference
): RoutePreference {
  const { safe, quick } = candidates;
  if (safe === undefined || quick === undefined || trail.length < ENOUGH) {
    return preference;
  }
  const toSafe = trailScore(trail, safe);
  const toQuick = trailScore(trail, quick);
  if (toSafe + MARGIN < toQuick) {
    return "safe";
  }
  return toQuick + MARGIN < toSafe ? "quick" : preference;
}

/**
 * How far the trail ran from `route`, in cells: the weighted mean distance
 * from its points to the nearest leg, each point weighed by how far back
 * along the drag it lies. Lower is closer.
 */
export function trailScore(trail: readonly Point[], route: Route): number {
  const legs = route.steps.map((step) => cellCentre(step.cell));
  if (legs.length < 2) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  let weight = 0;
  let back = 0;
  for (let i = trail.length - 1; i >= 0 && back <= MEMORY; i -= 1) {
    const point = trail[i];
    if (point === undefined) {
      continue;
    }
    const w = DECAY_PER_CELL ** back;
    sum += nearestLeg(point, legs) * w;
    weight += w;
    const previous = trail[i - 1];
    if (previous !== undefined) {
      back += Math.hypot(point.x - previous.x, point.y - previous.y);
    }
  }
  return weight === 0 ? Number.POSITIVE_INFINITY : sum / weight;
}

// How far a point lies from the nearest leg of a route.
function nearestLeg(point: Point, legs: readonly Point[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let leg = 1; leg < legs.length; leg += 1) {
    const from = legs[leg - 1];
    const to = legs[leg];
    if (from !== undefined && to !== undefined) {
      nearest = Math.min(nearest, toSegment(point, from, to));
    }
  }
  return nearest;
}

// The distance from a point to a line segment, clamped to its ends.
function toSegment(point: Point, from: Point, to: Point): number {
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const length = vx * vx + vy * vy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - from.x) * vx + (point.y - from.y) * vy) / length));
  return Math.hypot(point.x - (from.x + vx * t), point.y - (from.y + vy * t));
}
