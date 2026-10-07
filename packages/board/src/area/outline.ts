/**
 * ─ An area's footprint ─
 *
 * The ring an area draws on the plan, in cells, so the layer beside it
 * has only points to stroke. A cone's far edge is round or flat, a 3D
 * cone that tilts covers the shadow of its volume, and a ring keeps its
 * hole as a second loop. Set to line of sight the ring is swept from the
 * origin, so what a wall cuts off is not drawn. The volume decides what
 * is caught; this decides what is seen.
 * Design: docs/design.md §5 "Templates are areas, laid down from the
 * same column"; docs/templates.md "What stops it".
 */

import type { Point } from "../shared/geometry.js";
import type { Topology } from "../topology/derive.js";
import type { GridRule } from "../topology/rules/distance.js";
import { sweep } from "../topology/rules/sweep.js";
import { pointInPolygon } from "../topology/shapes.js";
import { aimVector, spotToCellPoint, spotToCellSpot, type Area, type Spot } from "./area.js";

/** What an area covers on the plan: its ring, and the hole a ring keeps. */
export interface Outline {
  readonly ring: readonly Point[];
  readonly hole?: readonly Point[];
}

// How finely an arc is walked. Four degrees is under a tenth of a cell
// at any radius the table uses, and it keeps a full circle to ninety
// points rather than a thousand.
const ARC_STEP = 4;

/**
 * The footprint `area` covers, laid down at `origin`, in cells. Set to
 * line of sight, its ring is cut where the line from the origin is
 * stopped, on the plan at the origin's height; a ring's hole is kept as
 * it is.
 */
export function outline(area: Area, origin: Spot, topology: Topology, rule: GridRule): Outline {
  const whole = footprint(area, origin, rule);
  if (area.reaches === "around-corners" || whole.ring.length < 3) {
    return whole;
  }
  const from = spotToCellSpot(origin, rule);
  const far = whole.ring.map((point) => ({ ...point, z: from.z }));
  return { ...whole, ring: sweep(topology, from, far) };
}

/** The footprint `area` covers laid down at `origin`, in cells, with nothing in its way. */
export function footprint(area: Area, origin: Spot, rule: GridRule): Outline {
  const at = spotToCellPoint(origin, rule);
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
  const d = aimVector(area.yaw);
  const across = { x: -d.y, y: d.x };
  const length = cells(area.length);
  const half = cells(area.width) / 2;
  const corner = (run: number, side: number): Point => ({
    x: at.x + d.x * run + across.x * side,
    y: at.y + d.y * run + across.y * side,
  });
  return [corner(0, -half), corner(length, -half), corner(length, half), corner(0, half)];
}

type Cone = Extract<Area, { kind: "cone" }>;

// A level cone is its wedge on the plan, flat or 3D; a 3D cone that tilts
// is the shadow of its volume.
function coneRing(area: Cone, at: Point, cells: (feet: number) => number): Point[] {
  if (area.spread <= 0) {
    return [];
  }
  if (area.form === "3d" && area.pitch !== 0) {
    return tiltedRing(area, at, cells);
  }
  const length = cells(area.length);
  const half = area.spread / 2;
  const yaw = area.yaw;
  if (area.edge === "flat") {
    // As wide as it is long at the far edge, so its corners reach past
    // the length; the two rays meet a straight line across.
    const reach = length / Math.cos((half * Math.PI) / 180);
    return [at, along(at, yaw - half, reach), along(at, yaw + half, reach)];
  }
  const ring: Point[] = [at];
  for (let turn = -half; turn < half; turn += ARC_STEP) {
    ring.push(along(at, yaw + turn, length));
  }
  ring.push(along(at, yaw + half, length));
  return ring;
}

// A 3D cone tilted up or down, seen from above. It is everything between
// its apex and its far end, so its footprint is the plan shadow of the
// two: a flat edge's disc square to the axis, or a round edge's cap of
// the length's sphere, which its rim bounds and, where the cap reaches
// level, the sphere's widest ring. The cone is convex, so the hull of
// those points is the footprint, and it holds the apex.
function tiltedRing(area: Cone, at: Point, cells: (feet: number) => number): Point[] {
  const length = cells(area.length);
  const half = ((area.spread / 2) * Math.PI) / 180;
  const tilt = (area.pitch * Math.PI) / 180;
  const axis = aimVector(area.yaw, area.pitch);
  const ahead = aimVector(area.yaw);
  // Two ways square to the axis, seen from above: level across it, and up
  // the upright plane through it, which runs back along the yaw as the
  // cone tilts up and shrinks to nothing as it levels.
  const across = { x: -ahead.y, y: ahead.x };
  const up = { x: -Math.sin(tilt) * ahead.x, y: -Math.sin(tilt) * ahead.y };
  const isRound = area.edge === "round";
  const out = isRound ? length * Math.cos(half) : length;
  const radius = isRound ? length * Math.sin(half) : length * Math.tan(half);
  const centre = { x: at.x + axis.x * out, y: at.y + axis.y * out };
  const points: Point[] = [at];
  for (let turn = 0; turn < 360; turn += ARC_STEP) {
    const side = Math.cos((turn * Math.PI) / 180) * radius;
    const rise = Math.sin((turn * Math.PI) / 180) * radius;
    points.push({
      x: centre.x + across.x * side + up.x * rise,
      y: centre.y + across.y * side + up.y * rise,
    });
  }
  // The level bearings the cap holds are those within the half spread of
  // the axis: turned from the yaw by no more than the angle whose cosine
  // is the half spread's over the tilt's. A cone tilted past its half
  // spread holds none.
  const level = Math.cos(half) / Math.cos(tilt);
  if (isRound && level <= 1) {
    const widest = (Math.acos(level) * 180) / Math.PI;
    for (let turn = -widest; turn < widest; turn += ARC_STEP) {
      points.push(along(at, area.yaw + turn, length));
    }
    points.push(along(at, area.yaw + widest, length));
  }
  return hull(points);
}

// The convex hull of a set of points, in order round it: the lower chain
// left to right and the upper chain back, by Andrew's monotone chain.
function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower = chain(sorted);
  const upper = chain(sorted.reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// One chain of the hull: each point in turn, after dropping every point
// it shows was not a left turn.
function chain(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    while (bendsBack(kept, point)) {
      kept.pop();
    }
    kept.push(point);
  }
  return kept;
}

// Whether the last two points kept and the next one fail to turn left.
function bendsBack(kept: readonly Point[], next: Point): boolean {
  const a = kept[kept.length - 2];
  const b = kept[kept.length - 1];
  if (a === undefined || b === undefined) {
    return false;
  }
  return (b.x - a.x) * (next.y - a.y) - (b.y - a.y) * (next.x - a.x) <= 0;
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
// from north, as a yaw is read everywhere else on the board.
function along(at: Point, degrees: number, reach: number): Point {
  const d = aimVector(degrees);
  return { x: at.x + d.x * reach, y: at.y + d.y * reach };
}

/** Whether an area's footprint, as drawn, covers a point on the plan, both in cells. */
export function footprintCovers(
  area: Area,
  origin: Spot,
  at: Point,
  topology: Topology,
  rule: GridRule
): boolean {
  const { ring, hole } = outline(area, origin, topology, rule);
  if (ring.length < 3 || !pointInPolygon(at, ring)) {
    return false;
  }
  return hole === undefined || !pointInPolygon(at, hole);
}
