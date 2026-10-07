/**
 * ─ What an area holds ─
 *
 * The containment tests, in three dimensions and in the rule's own
 * unit. A cone is one angular test about its axis with a choice of cap,
 * and the only difference between flat and 3D is whether the offset
 * from the axis counts the vertical, and so whether the axis may tilt.
 * A beam is three pairs of parallel faces about its own line. The
 * surface is the same forms read from above: the height of a 3D form's
 * top at a point of the plan, which the board lights and the shader
 * works out pixel by pixel from the same sums. A beam alone parts from
 * its volume, on purpose: it catches as the box and is drawn as the
 * round tube inside it, so it shades as a cone does.
 * Design: docs/design.md §5 "Every area has a vertical form";
 * docs/templates.md "Yaw and pitch" and "How it is worked out".
 */

import type { Point } from "../shared/geometry.js";
import { aimVector, type Area, type ConeArea, type RectArea, type Spot } from "./area.js";

/** Whether `spot` lies inside `area` laid down at `origin`. */
export function holds(area: Area, origin: Spot, spot: Spot): boolean {
  const v = { x: spot.x - origin.x, y: spot.y - origin.y, z: spot.z - origin.z };
  switch (area.kind) {
    case "rect":
      return area.form === "beam" ? inBeam(area, v) : inWall(area, v);
    case "cone":
      return inCone(area, v);
    default:
      return inCircle(area, v);
  }
}

interface Offset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

type Cone = Extract<Area, { kind: "cone" }>;
type Rect = Extract<Area, { kind: "rect" }>;

function dot(a: Offset, b: Offset): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

// How far along a unit axis an offset runs, and how far it lies off it.
function split(axis: Offset, v: Offset): { along: number; across: number } {
  const along = dot(v, axis);
  return {
    along,
    across: Math.hypot(v.x - along * axis.x, v.y - along * axis.y, v.z - along * axis.z),
  };
}

// An offset on the plan alone, for a form that turns by yaw only and
// keeps its height as a band of its own.
function onPlan(v: Offset): Offset {
  return { x: v.x, y: v.y, z: 0 };
}

// A wall: a width across and a height rising from the origin, turned by
// yaw alone, so its pitch waits unread for when it is a beam again.
function inWall(area: Rect, v: Offset): boolean {
  const { along, across } = split(aimVector(area.yaw), onPlan(v));
  if (along < 0 || along > area.length) {
    return false;
  }
  return across <= area.width / 2 && v.z >= 0 && v.z <= area.height;
}

// A beam catches as a box: out along its line to the length, half the
// width either side on the level, and half the height either side of the
// line. It is drawn as the round tube inside, as beamSpan says.
function inBeam(area: Rect, v: Offset): boolean {
  const { along, across, up } = beamFrame(area);
  const run = dot(v, along);
  return (
    run >= 0 &&
    run <= area.length &&
    Math.abs(dot(v, across)) <= area.width / 2 &&
    Math.abs(dot(v, up)) <= area.height / 2
  );
}

/** The three ways a beam's faces stand square to, each a unit vector across the map and up. */
export interface BeamFrame {
  /** Along its line, turned by its yaw and tilted by its pitch. */
  readonly along: Offset;
  /** Across its line, on the level. */
  readonly across: Offset;
  /** Square to both, and never pointing down. */
  readonly up: Offset;
}

/**
 * A beam's frame, from its yaw and its pitch. Across is taken from the
 * yaw rather than from the line, so it holds straight up or down, where
 * the line has no way across the plan of its own.
 */
export function beamFrame(area: Rect): BeamFrame {
  const along = aimVector(area.yaw, area.pitch);
  const ahead = aimVector(area.yaw);
  const across = { x: -ahead.y, y: ahead.x, z: 0 };
  // Along crossed with across, whose rise is the cosine of the pitch, so it
  // points up from straight down to straight up.
  const up = {
    x: along.y * across.z - along.z * across.y,
    y: along.z * across.x - along.x * across.z,
    z: along.x * across.y - along.y * across.x,
  };
  return { along, across, up };
}

/** A beam's eight corners, as offsets from its origin in the rule's unit. */
export function beamCorners(area: Rect): Offset[] {
  const { along, across, up } = beamFrame(area);
  const corners: Offset[] = [];
  for (const run of [0, area.length]) {
    for (const side of [-area.width / 2, area.width / 2]) {
      for (const rise of [-area.height / 2, area.height / 2]) {
        corners.push({
          x: along.x * run + across.x * side + up.x * rise,
          y: along.y * run + across.y * side + up.y * rise,
          z: along.z * run + across.z * side + up.z * rise,
        });
      }
    }
  }
  return corners;
}

// One wedge, two caps, and the form deciding whether the offset from the
// axis counts the vertical. A spread of nought opens onto nothing.
function inCone(area: Cone, v: Offset): boolean {
  if (area.spread <= 0) {
    return false;
  }
  const half = ((area.spread / 2) * Math.PI) / 180;
  if (area.form === "flat") {
    if (v.z < 0 || v.z > area.height) {
      return false;
    }
    const { along, across } = split(aimVector(area.yaw), onPlan(v));
    return area.edge === "round"
      ? Math.hypot(v.x, v.y) <= area.length && across <= along * Math.tan(half) && along >= 0
      : along >= 0 && along <= area.length && across <= along * Math.tan(half);
  }
  // The same wedge in three dimensions about an axis that tilts by the
  // pitch: the offset counts every way off the axis, the rise included.
  const { along, across } = split(aimVector(area.yaw, area.pitch), v);
  if (along < 0) {
    return false;
  }
  const reach = area.edge === "round" ? Math.hypot(along, across) : along;
  return reach <= area.length && across <= along * Math.tan(half);
}

// A sphere reaches every way, a dome stops at the floor it sits on, a
// cylinder is a column rising from it. The inner radius makes a ring.
function inCircle(area: Extract<Area, { kind: "circle" }>, v: Offset): boolean {
  const flat = Math.hypot(v.x, v.y);
  if (area.form === "cylinder") {
    return flat <= area.radius && flat >= area.inner && v.z >= 0 && v.z <= area.height;
  }
  const reach = Math.hypot(flat, v.z);
  if (reach > area.radius || reach < area.inner) {
    return false;
  }
  return area.form === "sphere" || v.z >= 0;
}

/**
 * Whether an area is a 3D form, which the board draws as a lit solid: a
 * cone that stands up, a beam, a sphere, a dome or a cylinder. A flat
 * cone and a wall lie on the plan and draw as a wash.
 */
export function isSolid(area: Area): boolean {
  switch (area.kind) {
    case "rect":
      return area.form === "beam";
    case "cone":
      return area.form === "3d";
    default:
      return true;
  }
}

/**
 * The top of a 3D form at a point of the plan, as a height above the
 * origin in the rule's unit, below it where a cone tilts down, or
 * undefined where there is no solid: past its edge, or under a flat
 * form, which has no top to light. Worked out exactly at the point; the
 * shader does the same sums for every pixel. A beam's top is its tube's,
 * which lies inside the box it catches with.
 */
export function surface(area: Area, origin: Spot, at: Point): number | undefined {
  const v = { x: at.x - origin.x, y: at.y - origin.y };
  switch (area.kind) {
    case "rect":
      return area.form === "beam" ? beamSpan(area, v, true)?.hi : undefined;
    case "cone":
      return coneTop(area, v);
    default:
      return circleTop(area, v);
  }
}

/** A stretch of height, from `lo` up to `hi`. */
export interface HeightSpan {
  readonly lo: number;
  readonly hi: number;
}

/**
 * The stretch of height a cone or a rectangle holds over a point of the
 * plan, from `lo` to `hi` above its origin, or undefined where it holds
 * none. A wall and a flat cone stand in one band from the origin up; a
 * 3D cone is cut exactly; a beam is its box, which it catches with,
 * rather than the tube it is drawn as.
 */
export function heldSpan(
  area: RectArea | ConeArea,
  origin: Spot,
  at: Point
): HeightSpan | undefined {
  if (!isSolid(area)) {
    // The band is the same over every point it covers, so the plan alone
    // decides, asked at the origin's own height.
    const isOver = holds(area, origin, { ...at, z: origin.z });
    return isOver ? { lo: 0, hi: area.height } : undefined;
  }
  const v = { x: at.x - origin.x, y: at.y - origin.y };
  if (area.kind === "rect") {
    return beamSpan(area, v, false);
  }
  return area.spread > 0 ? coneSpan(area, v) : undefined;
}

/**
 * The highest a 3D form rises above its origin, which its shadow is cast
 * from; nought for a flat form, and for a cone tilted so far down that
 * its apex is its highest point. A beam's is its box's highest corner,
 * which the tube inside it reaches too, since its way across is level.
 */
export function tallest(area: Area): number {
  switch (area.kind) {
    case "rect":
      return area.form === "beam" ? Math.max(...beamCorners(area).map((corner) => corner.z)) : 0;
    case "cone": {
      if (area.form === "flat" || area.spread <= 0) {
        return 0;
      }
      const half = ((area.spread / 2) * Math.PI) / 180;
      const tilt = (area.pitch * Math.PI) / 180;
      // The highest point is on the far edge, in the upright plane through
      // the axis. A round edge reaches it along the axis turned up by the
      // half spread, no further than straight up. A flat edge reaches it at
      // the top of its far disc, on the cone's upper side and the length
      // over the cosine of the half spread out along it.
      const top =
        area.edge === "round"
          ? area.length * Math.sin(Math.min(Math.PI / 2, tilt + half))
          : (area.length * Math.sin(tilt + half)) / Math.cos(half);
      return Math.max(0, top);
    }
    default:
      return area.form === "cylinder" ? area.height : area.radius;
  }
}

// A cone whose side stands this near upright is solved as upright, the
// quadratic in height falling to a line; the root it loses lies about a
// million times further up or down than the point lies along the axis.
const UPRIGHT = 1e-6;

function coneTop(area: Cone, v: Point): number | undefined {
  if (area.form === "flat" || area.spread <= 0) {
    return undefined;
  }
  return coneSpan(area, v)?.hi;
}

// The stretch of height, from `lo` to `hi` above the origin, that the
// upright line over a point of the plan cuts from a 3D cone: where it is
// inside the cone's side, on the side of the apex the cone opens to, and
// within its cap. The cone is convex, so the stretch is one interval or
// none. The shader's coneAt, in solid-cone.ts, makes the same cuts in
// the same order.
function coneSpan(area: Cone, v: Point): HeightSpan | undefined {
  const a = aimVector(area.yaw, area.pitch);
  const cos = Math.cos(((area.spread / 2) * Math.PI) / 180);
  const c2 = cos * cos;
  // Along the axis at height z is q + a.z * z; the plan's share is q.
  const q = v.x * a.x + v.y * a.y;
  const r2 = v.x * v.x + v.y * v.y;
  let lo = -Infinity;
  let hi = Infinity;
  // Inside the side: along² >= cos²(half) * |v|², which is A z² + 2B z + C
  // >= 0 in the height. Of its two nappes the one ahead of the apex is
  // kept, by the next cut where the stretch is bounded and by the tilt
  // where the cone holds the upright and the stretch runs off to one side.
  const A = a.z * a.z - c2;
  const B = q * a.z;
  const C = q * q - c2 * r2;
  if (Math.abs(A) < UPRIGHT) {
    if (B > 0) {
      lo = -C / (2 * B);
    } else if (B < 0) {
      hi = -C / (2 * B);
    } else if (C < 0) {
      return undefined;
    }
  } else {
    const disc = B * B - A * C;
    if (A < 0 && disc < 0) {
      return undefined;
    }
    const [z1, z2] = rootsOf(A, B, C, Math.sqrt(Math.max(disc, 0)));
    if (A < 0) {
      lo = z1;
      hi = z2;
    } else if (a.z > 0) {
      lo = z2;
    } else {
      hi = z1;
    }
  }
  // Ahead of the apex: along >= 0.
  if (a.z > 0) {
    lo = Math.max(lo, -q / a.z);
  } else if (a.z < 0) {
    hi = Math.min(hi, -q / a.z);
  } else if (q < 0) {
    return undefined;
  }
  // Within the cap: the length's sphere for a round edge, the plane
  // square to the axis at the length for a flat one.
  if (area.edge === "round") {
    const h2 = area.length * area.length - r2;
    if (h2 <= 0) {
      return undefined;
    }
    lo = Math.max(lo, -Math.sqrt(h2));
    hi = Math.min(hi, Math.sqrt(h2));
  } else if (a.z > 0) {
    hi = Math.min(hi, (area.length - q) / a.z);
  } else if (a.z < 0) {
    lo = Math.max(lo, (area.length - q) / a.z);
  } else if (q >= area.length) {
    return undefined;
  }
  return hi > lo ? { lo, hi } : undefined;
}

// The stretch of height, from `lo` to `hi` above the origin, that the
// upright line over a point of the plan cuts from a beam's box, which
// `inBeam` catches with, or, round, from the tube inside it that is drawn:
// its width across and its height up about its line. It is the box's
// three pairs of faces, and for the tube the last pair drawn in to the
// round side. Across is level, so how far across the line the point
// stands, s, is the same at every height, and there the tube reaches up
// and down the line by (h/2)·√(1 − (2s/w)²). Each pair cuts the line in
// one stretch, from where it crosses one face to where it crosses the
// other, except a pair standing upright, which keeps all of it or none.
// Box and tube are convex, so the overlap is one interval or none. The
// shader's tubeAt, in solid-beam.ts, makes the tube's cuts in the same
// order.
function beamSpan(area: Rect, v: Point, isRound: boolean): HeightSpan | undefined {
  const { along, across, up } = beamFrame(area);
  const side = v.x * across.x + v.y * across.y;
  const share = area.width > 0 ? (2 * side) / area.width : 1;
  const round = isRound ? Math.sqrt(Math.max(0, 1 - share * share)) : 1;
  const rim = (area.height / 2) * round;
  const pairs = [
    [along, 0, area.length],
    [across, -area.width / 2, area.width / 2],
    [up, -rim, rim],
  ] as const;
  let lo = -Infinity;
  let hi = Infinity;
  for (const [normal, from, to] of pairs) {
    // Along the normal at height z is plan + normal.z * z.
    const plan = v.x * normal.x + v.y * normal.y;
    if (normal.z === 0) {
      if (plan < from || plan > to) {
        return undefined;
      }
      continue;
    }
    const one = (from - plan) / normal.z;
    const two = (to - plan) / normal.z;
    lo = Math.max(lo, Math.min(one, two));
    hi = Math.min(hi, Math.max(one, two));
  }
  return hi > lo ? { lo, hi } : undefined;
}

// The two roots of A z² + 2B z + C, low then high, given the root of the
// discriminant; worked out so neither is lost to cancellation.
function rootsOf(A: number, B: number, C: number, root: number): [number, number] {
  const k = -(B + (B >= 0 ? root : -root));
  if (k === 0) {
    return [0, 0];
  }
  const one = k / A;
  const two = C / k;
  return one < two ? [one, two] : [two, one];
}

// A sphere and a dome rise to the radius over the centre and fall to
// nought at the rim; a shell's top is its outer face. A cylinder is its
// height across the whole disc, or the ring the inner radius leaves.
function circleTop(area: Extract<Area, { kind: "circle" }>, v: Point): number | undefined {
  const d = Math.hypot(v.x, v.y);
  if (area.form === "cylinder") {
    const margin = area.inner > 0 ? Math.min(area.radius - d, d - area.inner) : area.radius - d;
    return margin > 0 ? area.height : undefined;
  }
  if (d >= area.radius) {
    return undefined;
  }
  return Math.sqrt(area.radius * area.radius - d * d);
}
