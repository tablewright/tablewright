/**
 * ─ Passage ─
 *
 * What an edge lets through: movement, sight, or effect, the straight
 * segment a spell or an arrow follows. A wall stops all three; an arch
 * none; a door stops all three unless open; a window shows the room
 * beyond shut, lets effect through open or smashed, and movement only
 * open and large, or smashed. Line of sight and line of effect are the
 * segment against the edges, the first that stops it named.
 * Design: docs/design.md §5 "A measurement gives three answers".
 */

import type { Point } from "../geometry.js";
import type { Cell } from "../grid/square-grid.js";
import type { Edge } from "@tablewright/schema";
import type { EdgeData, Topology } from "./derive.js";

export type Passage = "move" | "sight" | "effect";

/** Where a segment meets an edge that stops it. */
export interface Crossing {
  readonly edge: EdgeData;
  /** In cell coordinates. */
  readonly at: Point;
  /** How far along the segment, 0 at its start and 1 at its end. */
  readonly t: number;
}

// Parallel lines and end points within this much of an edge count as met.
const EPSILON = 1e-9;

/** Whether an edge, or none, lets `passage` through. */
export function passes(data: EdgeData | undefined, passage: Passage): boolean {
  if (data === undefined) {
    return true;
  }
  if (data.kind === "wall") {
    return false;
  }
  const { threshold, state, size } = data;
  if (threshold === "arch") {
    return true;
  }
  // A secret threshold is a wall until play works it.
  if (state === "secret") {
    return false;
  }
  if (threshold === "door") {
    return state === "open" || state === "smashed";
  }
  switch (passage) {
    case "sight":
      return true;
    case "effect":
      return state === "open" || state === "smashed";
    default:
      return state === "smashed" || (state === "open" && size === "large");
  }
}

/** The centre of a cell, in cell coordinates. */
export function cellCentre(cell: Cell): Point {
  return { x: cell.col + 0.5, y: cell.row + 0.5 };
}

/** The first edge along the segment that stops `passage`, if any. */
export function firstBlock(
  topology: Topology,
  from: Point,
  to: Point,
  passage: Passage
): Crossing | undefined {
  let first: Crossing | undefined;
  for (const data of topology.edges.values()) {
    if (passes(data, passage)) {
      continue;
    }
    const t = crossingOf(from, to, data.edge);
    if (t !== undefined && (first === undefined || t < first.t)) {
      first = {
        edge: data,
        at: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
        t,
      };
    }
  }
  return first;
}

/** Whether nothing stops an effect between the centres of two cells. */
export function hasLineOfEffect(topology: Topology, from: Cell, to: Cell): boolean {
  return firstBlock(topology, cellCentre(from), cellCentre(to), "effect") === undefined;
}

/** Whether nothing stops sight between the centres of two cells. */
export function hasLineOfSight(topology: Topology, from: Cell, to: Cell): boolean {
  return firstBlock(topology, cellCentre(from), cellCentre(to), "sight") === undefined;
}

// Where the segment p→q meets the edge, as its parameter along p→q, or
// undefined when it does not. A segment running along an edge is beside
// it, not through it.
function crossingOf(p: Point, q: Point, edge: Edge): number | undefined {
  const a =
    edge.side === "east" ? { x: edge.col + 1, y: edge.row } : { x: edge.col, y: edge.row + 1 };
  const b = { x: edge.col + 1, y: edge.row + 1 };
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < EPSILON) {
    return undefined;
  }
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / denominator;
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / denominator;
  const within = (value: number): boolean => value >= -EPSILON && value <= 1 + EPSILON;
  return within(t) && within(u) ? Math.min(1, Math.max(0, t)) : undefined;
}
