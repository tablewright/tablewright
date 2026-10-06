/**
 * ─ The sweep ─
 *
 * What a straight line from one point reaches, as a ring. A ray goes to
 * each point along a footprint's edge and stops where the line stops,
 * and two go to each end of a solid edge inside the footprint, a hair
 * to either side of it, so a wall's end cuts the ring where the wall
 * ends rather than at the nearest ray along the edge. An area's outline
 * is cut by it; a light would be cast the same way.
 * Design: docs/templates.md "What stops it".
 */

import { along, lengthOf, segmentsMeet, type Point } from "../../shared/geometry.js";
import type { Topology } from "../derive.js";
import { edgeEnds } from "../edges.js";
import { firstStop, passes, type Against, type CellSpot } from "./effect.js";

// How far either side of a solid edge's end a ray is cast, in radians:
// enough that one ray meets the edge and the other misses it, too little
// to show at any reach the table uses.
const HAIR = 1e-5;
// A point this close to the origin, in cells, has no direction from it.
const AT_ORIGIN = 1e-9;

// One ray, kept in the ring's order: the side of the footprint it ends
// on, and how far along that side.
interface Ray {
  readonly side: number;
  readonly u: number;
  readonly to: CellSpot;
}

/**
 * The ring of what a straight line from `origin` reaches, out to the
 * footprint whose edge runs through `far` in order: each point is where
 * the line to it is stopped, else the point itself, and the ends of the
 * solid edges inside the footprint cut the ring between them. The
 * footprint is star-shaped about the origin, as every template's is.
 * Cast `against` the edges alone, the ground stops no ray.
 */
export function sweep(
  topology: Topology,
  origin: CellSpot,
  far: readonly CellSpot[],
  against: Against = "all"
): Point[] {
  const rays: Ray[] = far.map((to, side) => ({ side, u: 0, to }));
  const reach = far.reduce((most, to) => Math.max(most, lengthOf(origin, to)), 0) * 2 + 1;
  for (const end of solidEnds(topology)) {
    const away = lengthOf(origin, end);
    if (away < AT_ORIGIN) {
      continue;
    }
    const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
    const straight = rayTo(origin, angle, reach, far);
    // An end on or beyond the footprint's edge cuts nothing inside it, and
    // nor does one hidden behind a nearer wall: the rays to it would only
    // stop where the rays either side already do.
    if (straight === undefined || lengthOf(origin, straight.to) <= away) {
      continue;
    }
    const lift = (straight.to.z - origin.z) * (away / lengthOf(origin, straight.to));
    const stop = firstStop(topology, origin, { ...end, z: origin.z + lift }, against);
    if (stop !== undefined && lengthOf(origin, stop.at) < away - AT_ORIGIN) {
      continue;
    }
    for (const turn of [-HAIR, HAIR]) {
      const ray = rayTo(origin, angle + turn, reach, far);
      if (ray !== undefined) {
        rays.push(ray);
      }
    }
  }
  rays.sort((a, b) => a.side - b.side || a.u - b.u);
  return rays.map(({ to }) => stopOf(topology, origin, to, against));
}

// Where the line from the origin to `to` is stopped, else `to` itself.
function stopOf(topology: Topology, origin: CellSpot, to: CellSpot, against: Against): Point {
  if (lengthOf(origin, to) < AT_ORIGIN) {
    return { x: to.x, y: to.y };
  }
  const stop = firstStop(topology, origin, to, against);
  return stop === undefined ? { x: to.x, y: to.y } : stop.at;
}

// The ray from the origin at `angle`, ending where it leaves the
// footprint: the one side a star-shaped footprint shows it, not counting
// a side the origin itself sits on.
function rayTo(
  origin: CellSpot,
  angle: number,
  reach: number,
  far: readonly CellSpot[]
): Ray | undefined {
  const end = { x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach };
  let nearest: Ray | undefined;
  let nearestT = Infinity;
  for (let side = 0; side < far.length; side += 1) {
    const a = far[side];
    const b = far[(side + 1) % far.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    const met = segmentsMeet(origin, end, a, b);
    if (met === undefined || met.t * reach < AT_ORIGIN || met.t >= nearestT) {
      continue;
    }
    nearestT = met.t;
    nearest = { side, u: met.u, to: { ...along(a, b, met.u), z: a.z + (b.z - a.z) * met.u } };
  }
  return nearest;
}

// Every corner a solid edge ends at, each once.
function solidEnds(topology: Topology): Point[] {
  const ends = new Map<string, Point>();
  for (const data of topology.edges.values()) {
    if (passes(data, "sight")) {
      continue;
    }
    for (const end of edgeEnds(data.edge)) {
      ends.set(`${end.x},${end.y}`, end);
    }
  }
  return [...ends.values()];
}
