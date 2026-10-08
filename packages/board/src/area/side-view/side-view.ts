/**
 * ─ A side view ─
 *
 * A tilted area is hard to read from above, so the side view shows the
 * slice along its yaw: the ground and what stands on it, the area's own
 * cut, and a verdict for each token near it but the one it leaves from,
 * which stands at the origin as its source. It is worked out from the
 * topology and the tokens one seat sees, so it shows that seat nothing
 * more than its board does. A circle faces no way and has none.
 * Design: docs/templates.md "The side view".
 */

import type { Point } from "../../shared/geometry.js";
import type { TokenView } from "../../tokens/token-layer.js";
import type { Topology } from "../../topology/derive.js";
import type { GridRule } from "../../topology/rules/distance.js";
import { describeArea, type Area, type Spot } from "../area.js";
import { isSource, tokenSpot } from "../catches.js";
import { footprint } from "../outline.js";
import { isSolid } from "../volume.js";
import {
  alongOf,
  areaSlice,
  groundAlong,
  landsAlong,
  sliceFrame,
  uprightsAlong,
  type SidePoint,
  type Upright,
} from "./slice.js";
import { isNear, sidePlaceOf, sideTokenOf, type SidePlace, type SideToken } from "./verdict.js";

/** Everything a side view draws, every length in the rule's unit. */
export interface SideView {
  /** What it is a view of, as its badge names it: an area, or a line's distance and cover. */
  readonly label: string;
  readonly unit: string;
  /** How wide and tall a creature's cube is. */
  readonly cell: number;
  /** Where the slice starts, along the yaw from the origin; behind it is less than nought. */
  readonly from: number;
  /** Where the slice ends. */
  readonly to: number;
  /** How high the origin stands, at nought along. */
  readonly origin: number;
  /** The tilt to mark at the origin, for a form that tilts. */
  readonly pitch: number | undefined;
  readonly ground: readonly SidePoint[];
  readonly uprights: readonly Upright[];
  /** The area's cut through the slice, as one ring, before the ground hides any of it. */
  readonly area: readonly SidePoint[];
  /** The stretches of ground the area catches. */
  readonly lands: readonly (readonly SidePoint[])[];
  /**
   * The tokens it names: those near an area, the caught first, then the
   * clear, each nearest first; or the one a line is aimed at.
   */
  readonly tokens: readonly SideToken[];
  /**
   * The token the area leaves from, neither caught nor clear, when it was
   * laid from one; or the one a line leaves from.
   */
  readonly source: SidePlace | undefined;
}

// How far behind its origin a slice starts, in cells: enough to see what
// it leaves from.
const BEHIND = 1;

/**
 * The side view of `area` laid down at `origin`, from the token `source`
 * if it was laid from one, judged against `topology` and `tokens` as one
 * seat sees them, or undefined for an area with no direction.
 */
export function sideViewOf(
  area: Area,
  origin: Spot,
  topology: Topology,
  tokens: readonly TokenView[],
  rule: GridRule,
  source?: string
): SideView | undefined {
  if (area.kind === "circle") {
    return undefined;
  }
  const cell = rule.cellSize;
  const ring = footprint(area, origin, rule).ring;
  const aim = sliceFrame(origin, area.yaw, 0, 0, rule);
  const sourceToken = tokens.find((token) => isSource(area, token, source));
  const near = tokens.filter((token) => token !== sourceToken && isNear(ring, token));
  const shown = sourceToken === undefined ? near : [...near, sourceToken];
  const tokenAlong = shown.map((token) => alongOf(aim, tokenSpot(token, rule)));
  const slice = areaSlice(area, origin);
  // From a little behind the origin, or further where the area or a token
  // lies back there, out to the area's reach on the plan or the furthest
  // token past it.
  const reach = Math.max(0, ...ring.map((point) => alongOf(aim, scaled(point, cell))));
  const from = Math.min(
    -BEHIND * cell,
    ...slice.map((point) => point.along),
    ...tokenAlong.map((along) => along - cell / 2)
  );
  const to = Math.max(reach, ...tokenAlong.map((along) => along + cell / 2));
  const frame = sliceFrame(origin, area.yaw, from, to, rule);
  const judged = near.map((token) => sideTokenOf(area, token, topology, frame, ring, source));
  return {
    label: describeArea(area, rule),
    unit: rule.unit,
    cell,
    from,
    to,
    origin: origin.z,
    pitch: isSolid(area) ? area.pitch : undefined,
    ground: groundAlong(topology, frame),
    uprights: uprightsAlong(topology, frame),
    area: slice,
    lands: landsAlong(area, topology, frame),
    tokens: judged.sort(
      (a, b) =>
        Number(b.verdict.kind === "caught") - Number(a.verdict.kind === "caught") ||
        Math.abs(a.along) - Math.abs(b.along)
    ),
    source: sourceToken === undefined ? undefined : sidePlaceOf(sourceToken, frame),
  };
}

// A point in cells, in the rule's unit.
function scaled(point: Point, cell: number): Point {
  return { x: point.x * cell, y: point.y * cell };
}
