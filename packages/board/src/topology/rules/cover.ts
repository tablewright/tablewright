/**
 * ─ Cover ─
 *
 * How much of a target a straight line from an attacker cannot reach.
 * The line test runs from the attacker to points spread over the target's
 * face, five heights by three across, each the middle of an equal share
 * of it; the share stopped, against the system's shares, is the cover.
 * What stops the lines is kept, so a card can say what hides which part.
 * Design: docs/templates.md "A spell aimed at one creature".
 */

import type { Cover } from "@tablewright/schema";
import type { Cell } from "../../grid/square-grid.js";
import type { Point } from "../../shared/geometry.js";
import type { Topology } from "../derive.js";
import { edgeKey } from "../edges.js";
import type { CoverShares, GridRule } from "./distance.js";
import { cellCentre, firstStop, type CellSpot, type Stop } from "./effect.js";

// The points up the target's face and across it. Five heights tell a lip
// that hides the lower half from one that hides less; three across tell a
// wall's end that hides one side.
const ROWS = 5;
const COLUMNS = 3;

/** The cube a target fills: its cell, and the height of its foot in the rule's unit. */
export interface TargetCube {
  readonly cell: Cell;
  readonly foot: number;
}

/** One line from the attacker to a point of the target's face, and what stops it, if anything. */
export interface CoverRay {
  /** The point aimed at, across the map in cells and up in the rule's unit. */
  readonly to: CellSpot;
  /** How far up the face, nought at the foot. */
  readonly row: number;
  /** How far across it, nought at the left as the attacker sees it. */
  readonly column: number;
  readonly stop: Stop | undefined;
}

/** Which part of the target something hides, as the attacker sees it. */
export type CoverPart = "all" | "lower" | "left" | "right" | "some";

/** One thing that hides part of the target: a wall or a door, or the ground at one height. */
export interface Hider {
  /** The first of its stops, which names it. */
  readonly stop: Stop;
  /** The rays it stops, by their place among the answer's rays. */
  readonly rays: readonly number[];
  readonly part: CoverPart;
  /** The cover the share it hides would give alone. */
  readonly cover: Cover;
}

/** How much of a target the lines from an attacker find hidden, and what hides it. */
export interface CoverAnswer {
  readonly cover: Cover;
  /** The share of the lines stopped, from nought to one. */
  readonly share: number;
  readonly rays: readonly CoverRay[];
  /** What hides the target, the most first. */
  readonly hiders: readonly Hider[];
}

/**
 * The cover `target` has from a line leaving `from`, under `rule`. Each
 * point of its face is tested by `firstStop`, so a wall stops a line below
 * its top, a shut door in its band, the ground where the line runs under
 * it, and a window not at all.
 */
export function coverOf(
  topology: Topology,
  from: CellSpot,
  target: TargetCube,
  rule: GridRule
): CoverAnswer {
  const rays = facePoints(from, target, rule.cellSize).map((point) => ({
    ...point,
    stop: firstStop(topology, from, point.to),
  }));
  const share = rays.filter((ray) => ray.stop !== undefined).length / rays.length;
  return {
    cover: coverFor(share, rule.cover),
    share,
    rays,
    hiders: hidersOf(rays, rule.cover),
  };
}

/** The cover a share of the target hidden gives under `shares`. */
export function coverFor(share: number, shares: CoverShares): Cover {
  if (share >= shares.total) {
    return "total";
  }
  if (share >= shares.threeQuarters) {
    return "three-quarters";
  }
  return share >= shares.half ? "half" : "none";
}

// The middle of each equal share of the face: the upright square through
// the cube's centre, square to the line on the plan, a cell wide and a cell
// tall, its columns running left to right as the attacker sees it.
function facePoints(
  from: Point,
  target: TargetCube,
  cell: number
): { to: CellSpot; row: number; column: number }[] {
  const centre = cellCentre(target.cell);
  const length = Math.hypot(centre.x - from.x, centre.y - from.y);
  // Straight above or below the target, any way across serves.
  const way =
    length === 0
      ? { x: 0, y: -1 }
      : { x: (centre.x - from.x) / length, y: (centre.y - from.y) / length };
  // A quarter turn clockwise, on a map whose y runs south: the right hand.
  const right = { x: -way.y, y: way.x };
  const points: { to: CellSpot; row: number; column: number }[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const across = (column + 0.5) / COLUMNS - 0.5;
      points.push({
        to: {
          x: centre.x + right.x * across,
          y: centre.y + right.y * across,
          z: target.foot + ((row + 0.5) / ROWS) * cell,
        },
        row,
        column,
      });
    }
  }
  return points;
}

// The stopped rays grouped by what stopped them, an edge by where it is and
// the ground by its height, the group that stops the most first.
function hidersOf(rays: readonly CoverRay[], shares: CoverShares): Hider[] {
  const groups = new Map<string, { stop: Stop; indexes: number[]; stopped: CoverRay[] }>();
  rays.forEach((ray, index) => {
    const { stop } = ray;
    if (stop === undefined) {
      return;
    }
    const key = stop.by === "edge" ? edgeKey(stop.edge.edge) : `ground ${stop.height}`;
    const group = groups.get(key) ?? { stop, indexes: [], stopped: [] };
    group.indexes.push(index);
    group.stopped.push(ray);
    groups.set(key, group);
  });
  return [...groups.values()]
    .map(({ stop, indexes, stopped }) => ({
      stop,
      rays: indexes,
      part: partOf(stopped),
      cover: coverFor(indexes.length / rays.length, shares),
    }))
    .sort((a, b) => b.rays.length - a.rays.length);
}

// Which part a set of stopped points makes: all of the face; the lower part,
// when every column is stopped from its foot up and no higher; one side,
// when every row is stopped from that edge in; or some other part.
function partOf(stopped: readonly CoverRay[]): CoverPart {
  if (stopped.length === ROWS * COLUMNS) {
    return "all";
  }
  const at = new Set(stopped.map((ray) => ray.row * COLUMNS + ray.column));
  const has = (row: number, column: number): boolean => at.has(row * COLUMNS + column);
  const everyRow = (test: (row: number) => boolean): boolean =>
    Array.from({ length: ROWS }, (_, row) => row).every(test);
  const everyColumn = (test: (column: number) => boolean): boolean =>
    Array.from({ length: COLUMNS }, (_, column) => column).every(test);
  const isLower =
    everyColumn((column) => has(0, column)) &&
    stopped.every((ray) => ray.row === 0 || has(ray.row - 1, ray.column));
  const isLeft =
    everyRow((row) => has(row, 0)) &&
    stopped.every((ray) => ray.column === 0 || has(ray.row, ray.column - 1));
  const isRight =
    everyRow((row) => has(row, COLUMNS - 1)) &&
    stopped.every((ray) => ray.column === COLUMNS - 1 || has(ray.row, ray.column + 1));
  // A stop that reads two ways, along the foot and up one side, is neither.
  if (isLower && !isLeft && !isRight) {
    return "lower";
  }
  if (isLeft !== isRight && !isLower) {
    return isLeft ? "left" : "right";
  }
  return "some";
}
