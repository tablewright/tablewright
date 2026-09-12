/**
 * ─ An area's footprint ─
 *
 * The ring an area draws on the plan, in cells, so the layer beside it
 * has only points to stroke. A cone's far edge follows its own choice,
 * round or flat, and a ring keeps the hole in its middle as a second
 * loop. The volume decides what is caught; this decides what is seen.
 * Design: docs/design.md §5 "Templates are areas, laid down from the
 * same column".
 */

import type { Point } from "../geometry.js";
import type { GridRule } from "../topology/distance.js";
import { pointInPolygon } from "../topology/shapes.js";
import { aimVector, type Area, type Spot } from "./area.js";

/** What an area covers on the plan: its ring, and the hole a ring keeps. */
export interface Outline {
  readonly ring: readonly Point[];
  readonly hole?: readonly Point[];
}

// How finely an arc is walked. Four degrees is under a tenth of a cell
// at any radius the table uses, and it keeps a full circle to ninety
// points rather than a thousand.
const ARC_STEP = 4;

/** The footprint `area` covers, laid down at `origin`, in cells. */
export function outline(area: Area, origin: Spot, rule: GridRule): Outline {
  const at = { x: origin.x / rule.cellSize, y: origin.y / rule.cellSize };
  const cells = (feet: number): number => feet / rule.cellSize;
  switch (area.kind) {
    case "rect":
      return { ring: rectRing(area, at, cells) };
    case "cone":
      return { ring: coneRing(area, at, cells) };
    default:
      return circleRings(area, at, cells);
  }
}

function rectRing(
  area: Extract<Area, { kind: "rect" }>,
  at: Point,
  cells: (feet: number) => number
): Point[] {
  const d = aimVector(area.aim);
  const across = { x: -d.y, y: d.x };
  const length = cells(area.length);
  const half = cells(area.width) / 2;
  const corner = (run: number, side: number): Point => ({
    x: at.x + d.x * run + across.x * side,
    y: at.y + d.y * run + across.y * side,
  });
  return [corner(0, -half), corner(length, -half), corner(length, half), corner(0, half)];
}

function coneRing(
  area: Extract<Area, { kind: "cone" }>,
  at: Point,
  cells: (feet: number) => number
): Point[] {
  if (area.spread <= 0) {
    return [];
  }
  const length = cells(area.length);
  const half = area.spread / 2;
  const aim = area.aim;
  if (area.edge === "flat") {
    // As wide as it is long at the far edge, so its corners reach past
    // the length; the two rays meet a straight line across.
    const reach = length / Math.cos((half * Math.PI) / 180);
    return [at, along(at, aim - half, reach), along(at, aim + half, reach)];
  }
  const ring: Point[] = [at];
  for (let turn = -half; turn < half; turn += ARC_STEP) {
    ring.push(along(at, aim + turn, length));
  }
  ring.push(along(at, aim + half, length));
  return ring;
}

function circleRings(
  area: Extract<Area, { kind: "circle" }>,
  at: Point,
  cells: (feet: number) => number
): Outline {
  const ring = loop(at, cells(area.radius));
  return area.inner > 0 ? { ring, hole: loop(at, cells(area.inner)) } : { ring };
}

// A closed loop of points about a centre, walked at the arc's own step.
function loop(at: Point, radius: number): Point[] {
  const points: Point[] = [];
  for (let turn = 0; turn < 360; turn += ARC_STEP) {
    points.push(along(at, turn, radius));
  }
  return points;
}

// A point `reach` away from `at`, in the direction `degrees` clockwise
// from north, as an aim is read everywhere else on the board.
function along(at: Point, degrees: number, reach: number): Point {
  const d = aimVector(degrees);
  return { x: at.x + d.x * reach, y: at.y + d.y * reach };
}

/**
 * Whether an area's footprint covers a point on the plan, both in cells.
 * This is how one is picked up: a press inside what is drawn takes hold
 * of it, where a press outside starts a new one.
 */
export function footprintCovers(area: Area, origin: Spot, at: Point, rule: GridRule): boolean {
  const { ring, hole } = outline(area, origin, rule);
  if (ring.length < 3 || !pointInPolygon(at, ring)) {
    return false;
  }
  return hole === undefined || !pointInPolygon(at, hole);
}
