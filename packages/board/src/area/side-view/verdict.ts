/**
 * ─ Who a side view names ─
 *
 * The tokens a side view tells of, and what the board's own tests make
 * of each: caught, as `catchesToken` says, or clear, with the first
 * reason that holds. It is off the footprint on the plan, or the area
 * over its cell passes above or below the middle of its cube, or the
 * area holds it but a wall, a shut door or the ground cuts it off from
 * the origin. So the side view says what the board does, token for token.
 * The token the area leaves from is neither, and is only placed.
 * Design: docs/templates.md "The side view" and "What stops it".
 */

import { pointInPolygon } from "../../topology/shapes.js";
import type { Point } from "../../shared/geometry.js";
import type { TokenView } from "../../tokens/token-layer.js";
import type { Topology } from "../../topology/derive.js";
import { cellCentre, firstStop, topOf, type Stop } from "../../topology/rules/effect.js";
import { spotToCellSpot, type ConeArea, type RectArea, type Spot } from "../area.js";
import { catchesToken, placeOf, tokenSpot } from "../cover.js";
import { heldSpan, holds } from "../volume.js";
import { acrossOf, alongOf, type SidePoint, type SliceFrame } from "./slice.js";

// How near an area a token's cell must be to be named, in cells: one
// cell, and a twentieth more, since the footprint's arcs are walked in
// straight steps that fall a hair inside the true edge.
const NEAR = 1.05;

/** What the board makes of a token an area is near, and why. */
export type Verdict =
  | {
      readonly kind: "caught";
      /** How far out along the yaw it stands. */
      readonly out: number;
      /** The ground under it. */
      readonly ground: number;
      /** How far it stands above that floor. */
      readonly elevation: number;
    }
  | {
      /** Off the footprint on the plan: beside it, past its end, or behind its start. */
      readonly kind: "off";
      readonly side: "beside" | "past" | "behind";
    }
  | {
      /** Over its cell, the area passes above the middle of its cube, or below it. */
      readonly kind: "over" | "under";
      /**
       * Over, from the top of its cube up to the area's underside; under,
       * from the area's top up to its feet. Nought or less where the area
       * reaches into its cube but misses the middle the rule asks about.
       */
      readonly gap: number;
    }
  | {
      /** The area holds it, but the straight line from the origin is stopped on its way. */
      readonly kind: "hidden";
      readonly by: "wall" | "door" | "secret" | "ground";
      /** The top of the edge that stops the line, or the height of the ground. */
      readonly height: number;
      /** Where the line is stopped, in the slice. */
      readonly at: SidePoint;
    };

/** A token where a side view stands it in the slice. */
export interface SidePlace {
  readonly id: string;
  readonly label: string;
  /** How far along the yaw its cell's middle stands from the origin. */
  readonly along: number;
  /** The foot of its cube: the ground under it and how far it stands above that floor. */
  readonly z: number;
}

/** A token as a side view names it: where it stands in the slice, and its verdict. */
export interface SideToken extends SidePlace {
  readonly verdict: Verdict;
}

/** Where `token` stands in the slice. */
export function sidePlaceOf(token: TokenView, frame: SliceFrame): SidePlace {
  return {
    id: token.id,
    label: token.label,
    along: alongOf(frame, tokenSpot(token, frame.rule)),
    z: placeOf(token),
  };
}

/**
 * Whether a token is near enough an area to be named: its cell's middle
 * within the footprint, given in cells, or within a cell of it, so a near
 * miss beside the area is named too.
 */
export function isNear(ring: readonly Point[], token: TokenView): boolean {
  const middle = cellCentre(token.cell);
  return pointInPolygon(middle, ring) || distanceToRing(ring, middle) <= NEAR;
}

/**
 * How `area`, laid from the token `source` if from any, judges `token`:
 * caught exactly when `catchesToken` says so, and otherwise clear for the
 * first reason that holds. `ring` is the footprint with nothing in its
 * way, in cells.
 */
export function sideTokenOf(
  area: RectArea | ConeArea,
  token: TokenView,
  topology: Topology,
  frame: SliceFrame,
  ring: readonly Point[],
  source: string | undefined
): SideToken {
  const { origin, rule } = frame;
  const place = sidePlaceOf(token, frame);
  return {
    ...place,
    verdict: catchesToken(area, origin, token, topology, rule, source)
      ? {
          kind: "caught",
          out: place.along,
          ground: token.height ?? 0,
          elevation: token.elevation ?? 0,
        }
      : clearOf(area, token, tokenSpot(token, rule), topology, frame, ring),
  };
}

// Why an area that does not catch a token passes it by. The volume holding
// it means it is set to line of sight and cut off; otherwise the plan says
// whether it is under the area at all, and the height whether it is missed
// above or below.
function clearOf(
  area: RectArea | ConeArea,
  token: TokenView,
  spot: Spot,
  topology: Topology,
  frame: SliceFrame,
  ring: readonly Point[]
): Verdict {
  const { origin, rule } = frame;
  if (holds(area, origin, spot)) {
    const stop = firstStop(topology, spotToCellSpot(origin, rule), spotToCellSpot(spot, rule));
    if (stop !== undefined) {
      return hiddenBy(stop, spot, topology, frame);
    }
  }
  const span = heldSpan(area, origin, spot);
  if (span === undefined) {
    return { kind: "off", side: sideOf(ring, spot, frame) };
  }
  const lo = origin.z + span.lo;
  const hi = origin.z + span.hi;
  const foot = placeOf(token);
  // A middle the stretch seems to hold lies on its very edge, where the
  // volume's own test fell the other way; the nearer end is the one missed.
  const isOver = spot.z < lo || (spot.z <= hi && spot.z - lo < hi - spot.z);
  return isOver
    ? { kind: "over", gap: lo - (foot + rule.cellSize) }
    : { kind: "under", gap: foot - hi };
}

// What stopped the line from the origin to the token, and where in the slice.
function hiddenBy(stop: Stop, spot: Spot, topology: Topology, frame: SliceFrame): Verdict {
  const { origin, rule } = frame;
  const at = {
    along: alongOf(frame, { x: stop.at.x * rule.cellSize, y: stop.at.y * rule.cellSize }),
    z: origin.z + (spot.z - origin.z) * stop.t,
  };
  if (stop.by === "ground") {
    return { kind: "hidden", by: "ground", height: stop.height, at };
  }
  const data = stop.edge;
  const by = data.kind === "wall" ? "wall" : data.state === "secret" ? "secret" : "door";
  return { kind: "hidden", by, height: topOf(topology, data), at };
}

// Where a point off the footprint lies from it. Past its end when the
// footprint's cross-section along the yaw at the point's own offset across
// ends before it; behind when it stands behind the origin; else beside.
function sideOf(
  ring: readonly Point[],
  spot: Spot,
  frame: SliceFrame
): "beside" | "past" | "behind" {
  const cell = frame.rule.cellSize;
  const across = acrossOf(frame, spot);
  let far = -Infinity;
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length] ?? point;
    const a = { x: point.x * cell, y: point.y * cell };
    const b = { x: next.x * cell, y: next.y * cell };
    const ca = acrossOf(frame, a);
    const cb = acrossOf(frame, b);
    if (ca === cb || (ca - across) * (cb - across) > 0) {
      return;
    }
    const t = (across - ca) / (cb - ca);
    far = Math.max(far, alongOf(frame, a) + t * (alongOf(frame, b) - alongOf(frame, a)));
  });
  const along = alongOf(frame, spot);
  if (along > far && far > -Infinity) {
    return "past";
  }
  return along < 0 ? "behind" : "beside";
}

// The distance from a point to the nearest side of a ring.
function distanceToRing(ring: readonly Point[], p: Point): number {
  let nearest = Infinity;
  ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length] ?? a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
    const along = Math.max(0, Math.min(1, t));
    nearest = Math.min(nearest, Math.hypot(p.x - a.x - along * dx, p.y - a.y - along * dy));
  });
  return nearest;
}
