/**
 * ─ Passage ─
 *
 * What an edge lets through: movement, sight, or effect, the straight
 * segment a spell or an arrow follows. A wall stops all three; an arch
 * none; a door stops all three unless open; a window shows the room
 * beyond shut, lets effect through open or smashed, and movement only
 * open and large, or smashed. Line of sight and line of effect are the
 * segment against the edges, the first that stops it named. A line in
 * three dimensions is the same segment lifted: an edge stops it only
 * below its top, a window is a hole shut or not, and the ground stops
 * it wherever it runs under the field.
 * Design: docs/design.md §5 "A measurement gives three answers";
 * docs/templates.md "What stops it".
 */

import { along, segmentsMeet, type Point } from "../../shared/geometry.js";
import type { Cell } from "../../grid/square-grid.js";
import type { Edge } from "@tablewright/schema";
import { edgeCells, edgeEnds } from "../edges.js";
import { heightAt, type EdgeData, type Topology } from "../derive.js";
import { forSamplesAlong, type SampleSpan } from "../shapes.js";

export type Passage = "move" | "sight" | "effect";

/** Where a segment meets an edge that stops it. */
export interface Crossing {
  readonly edge: EdgeData;
  /** In cell coordinates. */
  readonly at: Point;
  /** How far along the segment, 0 at its start and 1 at its end. */
  readonly t: number;
}

/**
 * A spot with its plan in cells: across the map as `worldToCellPoint`
 * measures it, fractions and all, and up in the rule's unit, as the
 * field is kept.
 */
export interface CellSpot extends Point {
  readonly z: number;
}

/** What first stops a straight line in three dimensions, and where. */
export type Stop =
  | ({ readonly by: "edge" } & Crossing)
  | {
      readonly by: "ground";
      /** In cell coordinates. */
      readonly at: Point;
      /** How far along the line, 0 at its start and 1 at its end. */
      readonly t: number;
      /** The ground's height there, in the rule's unit. */
      readonly height: number;
    };

// An edge and the ground that stop a line within this much of one point
// stop it at one point.
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
  return firstCrossing(topology, from, to, (data) => !passes(data, passage));
}

/** Whether nothing stops an effect between the centres of two cells. */
export function hasLineOfEffect(topology: Topology, from: Cell, to: Cell): boolean {
  return firstBlock(topology, cellCentre(from), cellCentre(to), "effect") === undefined;
}

/** Whether nothing stops sight between the centres of two cells. */
export function hasLineOfSight(topology: Topology, from: Cell, to: Cell): boolean {
  return firstBlock(topology, cellCentre(from), cellCentre(to), "sight") === undefined;
}

/**
 * What first stops a straight line in three dimensions from `from` to
 * `to`, if anything: a wall or a shut door where the line crosses it
 * below the top, or the ground where the line runs under the field. A
 * window is a hole, shut or not, as it is to sight; the line of effect
 * on the plan keeps its own answer in `firstBlock`. The top of an edge
 * is its tallness above the higher of its two cells, so a wall on a
 * terrace rises from the terrace, and the edge is named where it and
 * the ground beneath it stop the line at one point.
 */
export function firstStop(topology: Topology, from: CellSpot, to: CellSpot): Stop | undefined {
  const edge = firstCrossing(
    topology,
    from,
    to,
    (data, t) => !passes(data, "sight") && heightAlong(from, to, t) < topOf(topology, data)
  );
  const ground = groundStop(topology, from, to);
  if (edge !== undefined && (ground === undefined || edge.t <= ground.t + EPSILON)) {
    return { by: "edge", ...edge };
  }
  return ground;
}

// The first edge along the segment that `stops` it, by where it is crossed.
function firstCrossing(
  topology: Topology,
  from: Point,
  to: Point,
  stops: (data: EdgeData, t: number) => boolean
): Crossing | undefined {
  let first: Crossing | undefined;
  for (const data of topology.edges.values()) {
    const t = crossingOf(from, to, data.edge);
    if (t !== undefined && (first === undefined || t < first.t) && stops(data, t)) {
      first = { edge: data, at: along(from, to, t), t };
    }
  }
  return first;
}

// Where the line first runs under the field, walking the samples it
// crosses: on entering a sample already under its ground, or where it
// drops through the ground on its way down inside one.
function groundStop(topology: Topology, from: CellSpot, to: CellSpot): Stop | undefined {
  let stop: Stop | undefined;
  forSamplesAlong(from, to, topology.samples, (span) => {
    const ground = span.index === undefined ? 0 : (topology.field[span.index] ?? 0);
    const t = dipAt(from, to, span, ground);
    if (t === undefined) {
      return false;
    }
    stop = { by: "ground", at: along(from, to, t), t, height: ground };
    return true;
  });
  return stop;
}

// Within a span of the line, where it first runs under `ground`, if it does.
function dipAt(from: CellSpot, to: CellSpot, span: SampleSpan, ground: number): number | undefined {
  if (heightAlong(from, to, span.tIn) < ground) {
    return span.tIn;
  }
  if (heightAlong(from, to, span.tOut) < ground) {
    // It came in above the ground and leaves below it, so it is falling.
    return (ground - from.z) / (to.z - from.z);
  }
  return undefined;
}

function heightAlong(from: CellSpot, to: CellSpot, t: number): number {
  return from.z + (to.z - from.z) * t;
}

/** An edge's top: its tallness above the higher of the two cells it sits between, which a line passes over. */
export function topOf(topology: Topology, data: EdgeData): number {
  const [near, far] = edgeCells(data.edge);
  return Math.max(heightAt(topology, near), heightAt(topology, far)) + data.tall;
}

/**
 * Where the segment `p` to `q` meets an edge, as how far along it, 0 at
 * `p` and 1 at `q`, or undefined when it does not. A segment running along
 * an edge is beside it, not through it.
 */
export function crossingOf(p: Point, q: Point, edge: Edge): number | undefined {
  const met = segmentsMeet(p, q, ...edgeEnds(edge));
  return met === undefined ? undefined : Math.min(1, Math.max(0, met.t));
}
