/**
 * ─ Shapes ─
 *
 * Where a stroke's shape lands, in cell units: which cells a rect, a
 * polygon or a brush disc encloses, and which of the field's samples.
 * Cells and samples are both tested at their centres, so a shape means
 * the same to the ground grid as to the field.
 * Design: docs/design.md §5 "Topology and measurement".
 */

import type { CellRect, Point as Coordinate, Shape } from "@tablewright/schema";
import type { Point } from "../geometry.js";
import type { CellExtent } from "../grid/grid-lines.js";

/** The field's samples over an extent: `per` to a cell along each axis. */
export interface SampleGrid {
  readonly bounds: CellExtent;
  readonly per: number;
}

export type CellVisitor = (col: number, row: number) => void;
/** `index` is the sample's place in the field; `i` and `j` its column and row of samples. */
export type SampleVisitor = (index: number, i: number, j: number) => void;

/** Samples across the field. */
export function sampleWidth(samples: SampleGrid): number {
  return samples.bounds.cols * samples.per;
}

/** Samples down the field. */
export function sampleHeight(samples: SampleGrid): number {
  return samples.bounds.rows * samples.per;
}

/** Whether a point lies inside a polygon, by the even-odd rule. */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Visit every cell within `bounds` whose centre the shape encloses. */
export function forCellsInShape(shape: Shape, bounds: CellExtent, visit: CellVisitor): void {
  switch (shape.kind) {
    case "rect":
      forCellsWhere(shape.rect, bounds, () => true, visit);
      break;
    case "free": {
      const polygon = placedPoints(shape.points);
      forCellsWhere(polygonBox(polygon), bounds, (p) => pointInPolygon(p, polygon), visit);
      break;
    }
    case "brush": {
      const radius = radiusOf(shape.radius);
      for (const dab of placedPoints(shape.points)) {
        forCellsWhere(discBox(dab, radius), bounds, (p) => within(p, dab, radius), visit);
      }
      break;
    }
  }
}

/** Visit every sample whose centre the shape encloses. */
export function forSamplesInShape(shape: Shape, samples: SampleGrid, visit: SampleVisitor): void {
  switch (shape.kind) {
    case "rect":
      forSamplesWhere(shape.rect, samples, () => true, visit);
      break;
    case "free": {
      const polygon = placedPoints(shape.points);
      forSamplesWhere(polygonBox(polygon), samples, (p) => pointInPolygon(p, polygon), visit);
      break;
    }
    case "brush": {
      const radius = radiusOf(shape.radius);
      for (const dab of placedPoints(shape.points)) {
        forSamplesWhere(discBox(dab, radius), samples, (p) => within(p, dab, radius), visit);
      }
      break;
    }
  }
}

// JSON has no NaN or infinity, so the record types every float as nullable.
// A null coordinate is not a place: such points are dropped here, at the
// boundary, and nothing past it sees a null.
export function placedPoints(points: readonly Coordinate[]): Point[] {
  const placed: Point[] = [];
  for (const { x, y } of points) {
    if (x !== null && y !== null) {
      placed.push({ x, y });
    }
  }
  return placed;
}

/** A brush radius as a number; a null one covers nothing. */
export function radiusOf(radius: number | null): number {
  return radius ?? 0;
}

/** The centre of sample (i, j), in cells. */
export function sampleCentre(samples: SampleGrid, i: number, j: number): Point {
  return {
    x: samples.bounds.colMin + (i + 0.5) / samples.per,
    y: samples.bounds.rowMin + (j + 0.5) / samples.per,
  };
}

// The cells of `box` inside `bounds` whose centre passes `test`.
function forCellsWhere(
  box: CellRect,
  bounds: CellExtent,
  test: (centre: Point) => boolean,
  visit: CellVisitor
): void {
  const clipped = clip(box, bounds);
  if (clipped === undefined) {
    return;
  }
  for (let row = clipped.row0; row <= clipped.row1; row += 1) {
    for (let col = clipped.col0; col <= clipped.col1; col += 1) {
      if (test({ x: col + 0.5, y: row + 0.5 })) {
        visit(col, row);
      }
    }
  }
}

// The samples under the cells of `box` whose centre passes `test`.
function forSamplesWhere(
  box: CellRect,
  samples: SampleGrid,
  test: (centre: Point) => boolean,
  visit: SampleVisitor
): void {
  const clipped = clip(box, samples.bounds);
  if (clipped === undefined) {
    return;
  }
  const { per, bounds } = samples;
  const width = sampleWidth(samples);
  const i0 = (clipped.col0 - bounds.colMin) * per;
  const i1 = (clipped.col1 - bounds.colMin + 1) * per - 1;
  const j0 = (clipped.row0 - bounds.rowMin) * per;
  const j1 = (clipped.row1 - bounds.rowMin + 1) * per - 1;
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      if (test(sampleCentre(samples, i, j))) {
        visit(j * width + i, i, j);
      }
    }
  }
}

function clip(box: CellRect, bounds: CellExtent): CellRect | undefined {
  const col0 = Math.max(box.col0, bounds.colMin);
  const row0 = Math.max(box.row0, bounds.rowMin);
  const col1 = Math.min(box.col1, bounds.colMin + bounds.cols - 1);
  const row1 = Math.min(box.row1, bounds.rowMin + bounds.rows - 1);
  return col0 <= col1 && row0 <= row1 ? { col0, row0, col1, row1 } : undefined;
}

// The cells a polygon can touch, a cell wider than its corners on every side.
function polygonBox(points: readonly Point[]): CellRect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    col0: Math.floor(minX) - 1,
    row0: Math.floor(minY) - 1,
    col1: Math.ceil(maxX),
    row1: Math.ceil(maxY),
  };
}

function discBox(centre: Point, radius: number): CellRect {
  return {
    col0: Math.floor(centre.x - radius) - 1,
    row0: Math.floor(centre.y - radius) - 1,
    col1: Math.ceil(centre.x + radius),
    row1: Math.ceil(centre.y + radius),
  };
}

function within(p: Point, centre: Point, radius: number): boolean {
  return Math.hypot(p.x - centre.x, p.y - centre.y) <= radius;
}
