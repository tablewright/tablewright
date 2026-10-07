/**
 * ─ What cuts an area ─
 *
 * An area set to line of sight shows only what a straight line from its
 * origin reaches. A flat form is cut on the plan: its ring is swept at
 * the origin's height. A solid is cut where it is drawn, pixel by pixel
 * on the GPU, by the same straight-line test the rules make: the line
 * from the origin to the solid's top at that pixel, against the ground
 * and the solid edges on its way. `risesTo` is that test on the CPU, and
 * `edgeTops` lays the edges out for the shader to read.
 * Design: docs/templates.md "What stops it".
 */

import type { Point } from "../shared/geometry.js";
import type { Topology } from "../topology/derive.js";
import type { GridRule } from "../topology/rules/distance.js";
import { firstStop, passes, topOf } from "../topology/rules/effect.js";
import { spotToCellPoint, spotToCellSpot, type Area, type Spot } from "./area.js";
import { outline, type Outline } from "./outline.js";
import { isSolid, surface } from "./volume.js";

/** How an area is cut to what it reaches: a flat form by its ring on the plan, a solid pixel by pixel as it is drawn. */
export type AreaCut =
  | { readonly kind: "ring"; readonly outline: Outline }
  | { readonly kind: "solid" };

/** The cut `area` takes laid down at `origin`. */
export function cutOf(area: Area, origin: Spot, topology: Topology, rule: GridRule): AreaCut {
  if (isSolid(area)) {
    return { kind: "solid" };
  }
  return { kind: "ring", outline: outline(area, origin, topology, rule) };
}

/**
 * How high a solid's top stands at a point of the plan where it is drawn,
 * in the rule's unit above the scene's nought, or undefined where it is
 * not: past the form's edge, under the ground, or, set to line of sight,
 * where the straight line from the origin to creature height at that
 * point, the ground there and half a cell up as `cubeCentre` has it, is
 * stopped on its way. That is the test the caught cells make, so the
 * solid is cut where they are and climbs where they do. The shader makes
 * the same test for every pixel.
 */
export function risesTo(
  area: Area,
  origin: Spot,
  at: Point,
  topology: Topology,
  rule: GridRule
): number | undefined {
  const top = surface(area, origin, at);
  if (top === undefined) {
    return undefined;
  }
  const above = origin.z + top;
  const cell = spotToCellPoint({ ...at, z: 0 }, rule);
  const ground = groundUnder(topology, cell);
  if (above <= ground) {
    return undefined;
  }
  const creature = { ...cell, z: ground + rule.cellSize / 2 };
  const isStopped =
    area.reaches === "line-of-sight" &&
    firstStop(topology, spotToCellSpot(origin, rule), creature) !== undefined;
  return isStopped ? undefined : above;
}

/**
 * The solid edges as the shader reads them: for each cell two numbers,
 * the top of its east edge and of its south edge, each its tallness above
 * the higher of its two cells where the edge stops sight, and `OPEN_EDGE`
 * where there is none or it lets sight through. A cell's texel sits one
 * past its place in the bounds, so the edges on the map's west and north
 * borders, keyed to the cell outside, have a texel too.
 */
export interface EdgeTops {
  /** Texels across: the bounds' columns and one more. */
  readonly cols: number;
  /** Texels down: the bounds' rows and one more. */
  readonly rows: number;
  /** Two per texel, row-major: the east edge's top, then the south edge's. */
  readonly values: Float32Array;
}

/** An edge a line passes over at any height: none there, or one that lets sight through. */
export const OPEN_EDGE = -1e9;

// Which edge a boundary crossing meets, as the shader reads it too: a line
// stepping across the vertical boundary at x = c cells meets the east
// edge of the cell on its west, col c - 1, in the row the crossing falls
// in; stepping across the horizontal boundary at y = r it meets the south
// edge of the cell to its north, row r - 1, in the column it falls in.
// Cell (col, row) is texel (col - colMin + 1, row - rowMin + 1).
/** The tops of `topology`'s solid edges, laid out for the shader. */
export function edgeTops(topology: Topology): EdgeTops {
  const { bounds } = topology;
  const cols = bounds.cols + 1;
  const rows = bounds.rows + 1;
  const values = new Float32Array(cols * rows * 2).fill(OPEN_EDGE);
  for (const data of topology.edges.values()) {
    if (passes(data, "sight")) {
      continue;
    }
    const { col, row, side } = data.edge;
    const x = col - bounds.colMin + 1;
    const y = row - bounds.rowMin + 1;
    if (x < 0 || y < 0 || x >= cols || y >= rows) {
      continue;
    }
    values[(y * cols + x) * 2 + (side === "east" ? 0 : 1)] = topOf(topology, data);
  }
  return { cols, rows, values };
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
