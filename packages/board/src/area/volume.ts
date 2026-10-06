/**
 * ─ What an area holds ─
 *
 * The containment tests, in three dimensions and in the rule's own
 * unit. A cone is one angular test with a choice of cap, and the only
 * difference between flat and 3D is whether the offset from the axis
 * counts the vertical; getting that factoring right is what makes the
 * form a setting rather than a second shape. The surface is the same
 * forms read from above: the height of a 3D form's top at a point of
 * the plan, which the board lights and the shader works out pixel by
 * pixel from the same sums.
 * Design: docs/design.md §5 "Every area has a vertical form";
 * docs/templates.md "How it is worked out".
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

// Along the aim and across it, both flat on the map.
function split(aim: number, v: Offset): { along: number; across: number } {
  const d = aimVector(aim);
  const along = v.x * d.x + v.y * d.y;
  return { along, across: Math.hypot(v.x - along * d.x, v.y - along * d.y) };
}

// A width across and a height rising from the origin: the three sizes
// say everything, so there is no form to choose beside them.
function inRect(area: Extract<Area, { kind: "rect" }>, v: Offset): boolean {
  const { along, across } = split(area.aim, v);
  if (along < 0 || along > area.length) {
    return false;
  }
  return across <= area.width / 2 && v.z >= 0 && v.z <= area.height;
}

// One wedge, two caps, and the form deciding whether the offset from the
// axis counts the vertical. A spread of nought opens onto nothing.
function inCone(area: Extract<Area, { kind: "cone" }>, v: Offset): boolean {
  if (area.spread <= 0) {
    return false;
  }
  const half = ((area.spread / 2) * Math.PI) / 180;
  const { along, across } = split(area.aim, v);
  if (area.form === "flat") {
    if (v.z < 0 || v.z > area.height) {
      return false;
    }
    return area.edge === "round"
      ? Math.hypot(v.x, v.y) <= area.length && across <= along * Math.tan(half) && along >= 0
      : along >= 0 && along <= area.length && across <= along * Math.tan(half);
  }
  // The same wedge in three dimensions: the offset now counts the rise.
  const offset = Math.hypot(across, v.z);
  if (along < 0) {
    return false;
  }
  const reach = area.edge === "round" ? Math.hypot(along, offset) : along;
  return reach <= area.length && offset <= along * Math.tan(half);
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
 * origin in the rule's unit, or undefined where there is no solid: past
 * its edge, or under a flat form, which has no top to light. Worked out
 * exactly at the point; the shader does the same sums for every pixel.
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

/** The highest a 3D form rises above its origin, which its shadow is cast from; nought for a flat form. */
export function tallest(area: Area): number {
  switch (area.kind) {
    case "rect":
      return 0;
    case "cone": {
      if (area.form === "flat" || area.spread <= 0) {
        return 0;
      }
      const half = ((area.spread / 2) * Math.PI) / 180;
      // A round edge caps the wedge with the length's sphere, which it
      // meets at the length times the sine of the half spread.
      return area.edge === "round" ? area.length * Math.sin(half) : area.length * Math.tan(half);
    }
    default:
      return area.form === "cylinder" ? area.height : area.radius;
  }
}

// The wedge's radius here, less the way across it, capped by the length's
// sphere when the edge is round: inside while that margin is positive.
function coneTop(area: Extract<Area, { kind: "cone" }>, v: Point): number | undefined {
  if (area.form === "flat" || area.spread <= 0) {
    return undefined;
  }
  const half = ((area.spread / 2) * Math.PI) / 180;
  const { along, across } = split(area.aim, { ...v, z: 0 });
  const wedge = along * Math.tan(half);
  const reach =
    area.edge === "round" ? area.length - Math.hypot(along, across) : area.length - along;
  if (Math.min(wedge - across, reach) <= 0) {
    return undefined;
  }
  const rise = wedge * wedge - across * across;
  const cap = area.length * area.length - along * along - across * across;
  return Math.sqrt(Math.max(area.edge === "round" ? Math.min(rise, cap) : rise, 0));
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
