/**
 * ─ What cuts an area ─
 *
 * An area set to line of sight shows only what a straight line from its
 * origin reaches. A flat form is cut on the plan: its ring is swept at
 * the origin's height. A solid is cut where it is drawn, at every sample
 * of the field: the line to a point of its top clears the ground on its
 * way or it does not, and the walls are the sweep cast against the edges
 * alone. The clearance is walked once per ray from the origin, so the
 * shader has one number to compare each pixel's top against.
 * Design: docs/templates.md "What stops it".
 */

import { lengthOf, type Point } from "../shared/geometry.js";
import type { Topology } from "../topology/derive.js";
import type { GridRule } from "../topology/rules/distance.js";
import type { CellSpot } from "../topology/rules/effect.js";
import { sweep } from "../topology/rules/sweep.js";
import { forSamplesAlong, type SampleGrid } from "../topology/shapes.js";
import { aimVector, spotToCellPoint, spotToCellSpot, type Area, type Spot } from "./area.js";
import { outline, type Outline } from "./outline.js";
import { isSolid, surface } from "./volume.js";

/** A block of the field's samples: its first column and row, and how many it runs across and down. */
export interface SampleBox {
  readonly i0: number;
  readonly j0: number;
  readonly width: number;
  readonly height: number;
}

/**
 * What a solid must rise above at each sample of a box, in the rule's
 * unit, row-major: the least height a point there needs for the straight
 * line from the origin to clear the ground on its way. Infinite where a
 * wall stops the line; the ground's own height where nothing is in the
 * way, so a top is drawn there exactly when it stands above the ground.
 */
export interface Clearance {
  readonly box: SampleBox;
  readonly values: Float32Array;
}

/** How an area is cut to what it reaches: a flat form by its ring on the plan, a solid by what it must clear. */
export type AreaCut =
  | { readonly kind: "ring"; readonly outline: Outline }
  | { readonly kind: "solid"; readonly clearance: Clearance };

// The box reaches this many samples past the footprint, so the sample a
// point on the edge falls in is inside it.
const BOX_PAD = 1;

/** The cut `area` takes laid down at `origin`, from its whole `footprint`. */
export function cutOf(
  area: Area,
  origin: Spot,
  footprint: Outline,
  topology: Topology,
  rule: GridRule
): AreaCut {
  if (isSolid(area)) {
    return { kind: "solid", clearance: clearance(area, origin, footprint, topology, rule) };
  }
  return { kind: "ring", outline: outline(area, origin, topology, rule) };
}

/**
 * The clearance over the box around `footprint` for `area` laid down at
 * `origin`. Each ray from the origin to a sample on the box's edge is
 * walked once, carrying the steepest climb the ground has asked of it so
 * far; a sample several rays cross keeps the most any asked. Set to
 * spread around corners nothing need be cleared, and the box is filled
 * with nothing.
 */
export function clearance(
  area: Area,
  origin: Spot,
  footprint: Outline,
  topology: Topology,
  rule: GridRule
): Clearance {
  const { samples } = topology;
  const box = boxAround(footprint.ring, samples);
  const values = new Float32Array(box.width * box.height).fill(-Infinity);
  if (area.reaches === "around-corners" || footprint.ring.length < 3) {
    return { box, values };
  }
  const from = spotToCellSpot(origin, rule);
  const reach = footprint.ring.reduce((most, point) => Math.max(most, lengthOf(from, point)), 0);
  walkRays(topology, from, box, values, reach, fanOf(area, reach, samples.per));
  const far = footprint.ring.map((point) => ({ ...point, z: from.z }));
  blockCutOff(footprint.ring, sweep(topology, from, far, "edges"), box, samples, values);
  return { box, values };
}

/** What `clearance` asks at a point of the plan in cells: infinite past its box, where no solid is. */
export function clearanceAt(cleared: Clearance, samples: SampleGrid, at: Point): number {
  const { box, values } = cleared;
  const i = Math.floor((at.x - samples.bounds.colMin) * samples.per) - box.i0;
  const j = Math.floor((at.y - samples.bounds.rowMin) * samples.per) - box.j0;
  if (i < 0 || j < 0 || i >= box.width || j >= box.height) {
    return Infinity;
  }
  return values[j * box.width + i] ?? Infinity;
}

/**
 * How high a solid's top stands at a point of the plan where it is drawn,
 * in the rule's unit above the scene's nought, or undefined where it is
 * not: past the form's edge, under the ground, or below what the line
 * from the origin must clear. This is the rule the shader mirrors for
 * every pixel.
 */
export function risesTo(
  area: Area,
  origin: Spot,
  at: Point,
  topology: Topology,
  cleared: Clearance,
  rule: GridRule
): number | undefined {
  const top = surface(area, origin, at);
  if (top === undefined) {
    return undefined;
  }
  const above = origin.z + top;
  const cell = spotToCellPoint({ ...at, z: 0 }, rule);
  if (
    above <= groundUnder(topology, cell) ||
    above < clearanceAt(cleared, topology.samples, cell)
  ) {
    return undefined;
  }
  return above;
}

// The field at the sample under a point in cells; level at nought off the map.
function groundUnder(topology: Topology, cell: Point): number {
  const { bounds, per } = topology.samples;
  const i = Math.floor((cell.x - bounds.colMin) * per);
  const j = Math.floor((cell.y - bounds.rowMin) * per);
  const width = bounds.cols * per;
  if (i < 0 || j < 0 || i >= width || j >= bounds.rows * per) {
    return 0;
  }
  return topology.field[j * width + i] ?? 0;
}

// The samples a ring can touch, a sample wider than its corners every way.
function boxAround(ring: readonly Point[], samples: SampleGrid): SampleBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (ring.length === 0) {
    return { i0: 0, j0: 0, width: 1, height: 1 };
  }
  const { bounds, per } = samples;
  const i0 = Math.floor((minX - bounds.colMin) * per) - BOX_PAD;
  const j0 = Math.floor((minY - bounds.rowMin) * per) - BOX_PAD;
  const i1 = Math.floor((maxX - bounds.colMin) * per) + BOX_PAD;
  const j1 = Math.floor((maxY - bounds.rowMin) * per) + BOX_PAD;
  return { i0, j0, width: i1 - i0 + 1, height: j1 - j0 + 1 };
}

// Which way the rays go: a cone's wedge with a hair either side, since a
// ray past its sides meets nothing of it; every way for a round form.
interface Fan {
  readonly angle: number;
  readonly half: number;
}

function fanOf(area: Area, reach: number, per: number): Fan | undefined {
  if (area.kind !== "cone") {
    return undefined;
  }
  const aim = aimVector(area.aim);
  const half = ((area.spread / 2) * Math.PI) / 180;
  return { angle: Math.atan2(aim.y, aim.x), half: half + 2 / Math.max(reach * per, 1) };
}

// Rays through the fan a sample apart at the footprint's reach, so every
// sample inside it is crossed by one, walked a little past the reach.
// Along a ray, each sample asks that the line be over its ground where
// it enters and where it leaves; the steepest of those climbs so far,
// scaled out to where the ray crosses a sample, is what a point there
// must clear, and never less than its own ground.
function walkRays(
  topology: Topology,
  from: CellSpot,
  box: SampleBox,
  values: Float32Array,
  reach: number,
  fan: Fan | undefined
): void {
  const { samples, field } = topology;
  const z0 = from.z;
  const step = 1 / Math.max(reach * samples.per, 1);
  const start = fan === undefined ? 0 : fan.angle - fan.half;
  const arc = fan === undefined ? Math.PI * 2 : fan.half * 2;
  // A full circle closes on its first ray; a wedge needs its last one.
  const count = Math.ceil(arc / step) + (fan === undefined ? 0 : 1);
  const run = reach + 2 / samples.per;
  const cast = (angle: number): void => {
    const to = { x: from.x + Math.cos(angle) * run, y: from.y + Math.sin(angle) * run };
    let horizon = -Infinity;
    forSamplesAlong(from, to, samples, (span) => {
      const ground = span.index === undefined ? 0 : (field[span.index] ?? 0);
      if (span.tIn === 0) {
        if (ground > z0) {
          horizon = Infinity;
        }
      } else {
        horizon = Math.max(horizon, (ground - z0) / (span.tIn * run));
      }
      const local = indexIn(box, span.i, span.j);
      if (local !== undefined) {
        const d = ((span.tIn + span.tOut) / 2) * run;
        const needed = Number.isFinite(horizon)
          ? Math.max(ground, z0 + d * horizon)
          : horizon > 0
            ? Infinity
            : ground;
        if (needed > (values[local] ?? -Infinity)) {
          values[local] = needed;
        }
      }
      horizon = Math.max(horizon, (ground - z0) / (span.tOut * run));
      return span.tOut * run > reach;
    });
  };
  for (let k = 0; k < count; k += 1) {
    cast(start + k * step);
  }
}

// Every sample whose centre lies inside the whole `footprint` and outside
// the `swept` ring is marked as never cleared: what a wall cuts off, and
// nothing of the footprint's own edge, which the shader cuts exactly at
// each pixel. Row by row, each ring's crossings of the row are sorted,
// and a centre is inside a ring when an odd number lie to its right, as
// the point-in-polygon test counts them.
function blockCutOff(
  footprint: readonly Point[],
  swept: readonly Point[],
  box: SampleBox,
  samples: SampleGrid,
  values: Float32Array
): void {
  const { bounds, per } = samples;
  const whole: number[] = [];
  const kept: number[] = [];
  for (let j = 0; j < box.height; j += 1) {
    const y = bounds.rowMin + (box.j0 + j + 0.5) / per;
    crossingsOf(footprint, y, whole);
    crossingsOf(swept, y, kept);
    let passedWhole = 0;
    let passedKept = 0;
    for (let i = 0; i < box.width; i += 1) {
      const x = bounds.colMin + (box.i0 + i + 0.5) / per;
      passedWhole = passedBy(whole, passedWhole, x);
      passedKept = passedBy(kept, passedKept, x);
      const isInWhole = (whole.length - passedWhole) % 2 === 1;
      const isInKept = (kept.length - passedKept) % 2 === 1;
      if (isInWhole && !isInKept) {
        values[j * box.width + i] = Infinity;
      }
    }
  }
}

// Where `ring` crosses the row at `y`, sorted left to right, into `into`.
function crossingsOf(ring: readonly Point[], y: number, into: number[]): void {
  into.length = 0;
  for (let n = 0, m = ring.length - 1; n < ring.length; m = n, n += 1) {
    const a = ring[n];
    const b = ring[m];
    if (a !== undefined && b !== undefined && a.y > y !== b.y > y) {
      into.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
    }
  }
  into.sort((p, q) => p - q);
}

// How many of the sorted `crossings` lie at or left of `x`, counting on
// from the `passed` already counted for a point further left.
function passedBy(crossings: readonly number[], passed: number, x: number): number {
  let count = passed;
  while (count < crossings.length && (crossings[count] ?? Infinity) <= x) {
    count += 1;
  }
  return count;
}

function indexIn(box: SampleBox, i: number, j: number): number | undefined {
  const col = i - box.i0;
  const row = j - box.j0;
  if (col < 0 || row < 0 || col >= box.width || row >= box.height) {
    return undefined;
  }
  return row * box.width + col;
}
