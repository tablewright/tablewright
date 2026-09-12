/**
 * ─ What an area holds ─
 *
 * The containment tests, in three dimensions and in the rule's own
 * unit. A cone is one angular test with a choice of cap, and the only
 * difference between flat and 3D is whether the offset from the axis
 * counts the vertical; getting that factoring right is what makes the
 * form a setting rather than a second shape.
 * Design: docs/design.md §5 "Every area has a vertical form".
 */

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
