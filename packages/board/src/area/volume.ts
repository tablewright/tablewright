/**
 * ─ What an area holds ─
 *
 * The containment tests, in three dimensions and in the rule's own
 * unit. A cone is one angular test about its axis with a choice of cap,
 * and the only difference between flat and 3D is whether the offset
 * from the axis counts the vertical, and so whether the axis may tilt.
 * The surface is the same forms read from above: the height of a 3D
 * form's top at a point of the plan, which the board lights and the
 * shader works out pixel by pixel from the same sums.
 * Design: docs/design.md §5 "Every area has a vertical form";
 * docs/templates.md "Yaw and pitch" and "How it is worked out".
 */

import type { Point } from "../shared/geometry.js";
import { aimVector, type Area, type Spot } from "./area.js";

/** Whether `spot` lies inside `area` laid down at `origin`. */
export function holds(area: Area, origin: Spot, spot: Spot): boolean {
  const v = { x: spot.x - origin.x, y: spot.y - origin.y, z: spot.z - origin.z };
  switch (area.kind) {
    case "rect":
      return inRect(area, v);
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

// How far along a unit axis an offset runs, and how far it lies off it.
function split(axis: Offset, v: Offset): { along: number; across: number } {
  const along = v.x * axis.x + v.y * axis.y + v.z * axis.z;
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

// A width across and a height rising from the origin: the three sizes
// say everything, so there is no form to choose beside them.
function inRect(area: Extract<Area, { kind: "rect" }>, v: Offset): boolean {
  const { along, across } = split(aimVector(area.yaw), onPlan(v));
  if (along < 0 || along > area.length) {
    return false;
  }
  return across <= area.width / 2 && v.z >= 0 && v.z <= area.height;
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
 * cone that stands up, a sphere, a dome or a cylinder. A flat cone and a
 * rectangle lie on the plan and draw as a wash.
 */
export function isSolid(area: Area): boolean {
  return area.kind === "circle" || (area.kind === "cone" && area.form === "3d");
}

/**
 * The top of a 3D form at a point of the plan, as a height above the
 * origin in the rule's unit, below it where a cone tilts down, or
 * undefined where there is no solid: past its edge, or under a flat
 * form, which has no top to light. Worked out exactly at the point; the
 * shader does the same sums for every pixel.
 */
export function surface(area: Area, origin: Spot, at: Point): number | undefined {
  const v = { x: at.x - origin.x, y: at.y - origin.y };
  switch (area.kind) {
    case "rect":
      return undefined;
    case "cone":
      return coneTop(area, v);
    default:
      return circleTop(area, v);
  }
}

/**
 * The highest a 3D form rises above its origin, which its shadow is cast
 * from; nought for a flat form, and for a cone tilted so far down that
 * its apex is its highest point.
 */
export function tallest(area: Area): number {
  switch (area.kind) {
    case "rect":
      return 0;
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
function coneSpan(area: Cone, v: Point): { lo: number; hi: number } | undefined {
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
