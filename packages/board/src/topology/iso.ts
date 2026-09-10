/**
 * ─ Iso-lines ─
 *
 * Marching squares over the elevation field at one height: the contour
 * the display draws, following the art's own curve since the field is
 * sub-cell. Segments come in cell coordinates, unjoined; the display
 * strokes them as they are.
 * Design: docs/design.md §5 "Elevation is a field".
 */

import type { Point } from "../geometry.js";
import type { Topology } from "./derive.js";
import { sampleCentre, sampleHeight, sampleWidth } from "./shapes.js";

export interface Segment {
  readonly from: Point;
  readonly to: Point;
}

/** The contour of the field at `threshold`, as segments between sample centres. */
export function isoLines(topology: Topology, threshold: number): Segment[] {
  const { samples, field } = topology;
  const width = sampleWidth(samples);
  const height = sampleHeight(samples);
  const step = 1 / samples.per;
  const segments: Segment[] = [];
  const at = (i: number, j: number): number => field[j * width + i] ?? 0;
  // Where the threshold falls between two samples, as a fraction of the way.
  const along = (a: number, b: number): number => (b === a ? 0.5 : (threshold - a) / (b - a));
  for (let j = 0; j < height - 1; j += 1) {
    for (let i = 0; i < width - 1; i += 1) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      const index =
        (a >= threshold ? 8 : 0) |
        (b >= threshold ? 4 : 0) |
        (c >= threshold ? 2 : 0) |
        (d >= threshold ? 1 : 0);
      if (index === 0 || index === 15) {
        continue;
      }
      const { x, y } = sampleCentre(samples, i, j);
      const top = { x: x + along(a, b) * step, y };
      const right = { x: x + step, y: y + along(b, c) * step };
      const bottom = { x: x + along(d, c) * step, y: y + step };
      const left = { x, y: y + along(a, d) * step };
      switch (index) {
        case 1:
        case 14:
          segments.push({ from: left, to: bottom });
          break;
        case 2:
        case 13:
          segments.push({ from: bottom, to: right });
          break;
        case 3:
        case 12:
          segments.push({ from: left, to: right });
          break;
        case 4:
        case 11:
          segments.push({ from: top, to: right });
          break;
        case 5:
          segments.push({ from: top, to: left }, { from: bottom, to: right });
          break;
        case 6:
        case 9:
          segments.push({ from: top, to: bottom });
          break;
        case 7:
        case 8:
          segments.push({ from: top, to: left });
          break;
        default:
          segments.push({ from: top, to: right }, { from: left, to: bottom });
          break;
      }
    }
  }
  return segments;
}
