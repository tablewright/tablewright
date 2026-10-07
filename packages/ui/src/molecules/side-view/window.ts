/**
 * ─ What a plot shows ─
 *
 * The stretch of a slice a plot draws at one scale both ways: the whole
 * slice for the strip, and for a card only what says why its token is
 * caught or clear. That is the token, what decides it, the ground beneath,
 * and the origin while a cube can still be read with it in.
 * Design: docs/templates.md "The side view".
 */

import type { SidePoint, SideToken, SideView } from "@tablewright/board";

/** The stretch of a slice a plot shows: along from `from` to `to`, and up from `low` to `high`. */
export interface PlotWindow {
  readonly from: number;
  readonly to: number;
  readonly low: number;
  readonly high: number;
}

/** The room a plot draws its slice in, in pixels. */
export interface PlotRoom {
  readonly width: number;
  readonly height: number;
}

// A card draws a cell no larger than this, so a lone token does not fill
// it; and keeps the origin in only while a cell stays this large, the size
// of the disc that names a token. Both in pixels.
const LARGEST_CELL = 44;
const SMALLEST_CELL = 17;
// The air a card keeps about what it shows, in cells.
const AIR = 0.5;

/**
 * The whole slice: from its start to its end, and from the lowest ground
 * or token to the highest of anything in it.
 */
export function wholeWindow(view: SideView): PlotWindow {
  const placed = view.source === undefined ? view.tokens : [...view.tokens, view.source];
  return {
    from: view.from,
    to: view.to,
    low: Math.min(
      view.origin,
      ...view.ground.map((point) => point.z),
      ...placed.map((token) => token.z)
    ),
    high: Math.max(
      view.origin,
      ...view.ground.map((point) => point.z),
      ...view.area.map((point) => point.z),
      ...view.uprights.map((upright) => upright.top),
      ...placed.map((token) => token.z + view.cell)
    ),
  };
}

/** How many pixels a unit takes when `shown` is fit whole into `room` at one scale both ways. */
export function scaleIn(shown: PlotWindow, room: PlotRoom): number {
  return Math.min(
    room.width / Math.max(shown.to - shown.from, 1),
    room.height / Math.max(shown.high - shown.low, 1)
  );
}

/**
 * What a card about `token` closes in on, shaped to fill `room`: the token
 * and what decides it, the ground beneath, and the origin while a cell
 * stays readable with it in. A token behind the origin always has it,
 * since the origin is what it is behind.
 */
export function cardWindow(view: SideView, token: SideToken, room: PlotRoom): PlotWindow {
  const why = reasonsOf(view, token);
  const withOrigin = boxAbout(view, [...why, { along: 0, z: view.origin }]);
  const isBehind = token.verdict.kind === "off" && token.verdict.side === "behind";
  const isReadable = scaleIn(withOrigin, room) * view.cell >= SMALLEST_CELL;
  return fitted(isBehind || isReadable ? withOrigin : boxAbout(view, why), room, view.cell);
}

// The token's cube and what decides its verdict: where the template passes
// over its head or under its feet, where the line from the origin is
// stopped and the top of what stops it, or where the template ends short.
function reasonsOf(view: SideView, token: SideToken): SidePoint[] {
  const half = view.cell / 2;
  const cube = [
    { along: token.along - half, z: token.z },
    { along: token.along + half, z: token.z + view.cell },
  ];
  const { verdict } = token;
  switch (verdict.kind) {
    case "caught":
      return cube;
    case "over":
      return [...cube, { along: token.along, z: token.z + view.cell + Math.max(verdict.gap, 0) }];
    case "under":
      return [...cube, { along: token.along, z: token.z - Math.max(verdict.gap, 0) }];
    case "hidden":
      return [...cube, verdict.at, { along: verdict.at.along, z: verdict.height }];
    case "off": {
      const end = farthest(view.area);
      return verdict.side === "past" && end !== undefined ? [...cube, end] : cube;
    }
  }
}

// The box about `points` with air at the sides and above, its foot on the
// lowest ground beneath it, as the strip stands its slice on the base.
function boxAbout(view: SideView, points: readonly SidePoint[]): PlotWindow {
  const air = AIR * view.cell;
  const from = Math.min(...points.map((point) => point.along)) - air;
  const to = Math.max(...points.map((point) => point.along)) + air;
  const ground = groundWithin(view.ground, from, to);
  return {
    from,
    to,
    low: Math.min(...ground, ...points.map((point) => point.z)),
    high: Math.max(...ground, ...points.map((point) => point.z)) + air,
  };
}

// `box` widened about its middle and raised from its foot until it fills
// `room` at one scale, a cell no larger than the largest.
function fitted(box: PlotWindow, room: PlotRoom, cell: number): PlotWindow {
  if (room.width <= 0 || room.height <= 0) {
    return box;
  }
  const k = Math.min(scaleIn(box, room), LARGEST_CELL / cell);
  const middle = (box.from + box.to) / 2;
  const along = room.width / k;
  return {
    from: middle - along / 2,
    to: middle + along / 2,
    low: box.low,
    high: box.low + room.height / k,
  };
}

// The heights of the ground from `from` to `to`: each step inside, and
// where the line crosses either end.
function groundWithin(ground: readonly SidePoint[], from: number, to: number): number[] {
  const heights = ground
    .filter((point) => point.along >= from && point.along <= to)
    .map((point) => point.z);
  for (const end of [from, to]) {
    const at = heightAlong(ground, end);
    if (at !== undefined) {
      heights.push(at);
    }
  }
  return heights;
}

// The height of a line of points at `along`, between the two it falls
// between, or undefined off either end.
function heightAlong(line: readonly SidePoint[], along: number): number | undefined {
  for (let index = 1; index < line.length; index += 1) {
    const a = line[index - 1];
    const b = line[index];
    if (a === undefined || b === undefined || along < a.along || along > b.along) {
      continue;
    }
    const span = b.along - a.along;
    return span === 0 ? a.z : a.z + ((along - a.along) / span) * (b.z - a.z);
  }
  return undefined;
}

// The point of a ring furthest out along the slice.
function farthest(ring: readonly SidePoint[]): SidePoint | undefined {
  return ring.reduce<SidePoint | undefined>(
    (far, point) => (far === undefined || point.along > far.along ? point : far),
    undefined
  );
}
