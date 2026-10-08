/**
 * ─ The Marked view's tags ─
 *
 * Where the Marked view tags a rise or a drop, and the level it names.
 * Each band's contour ring names the level most of its length looks onto,
 * the ground beyond the line, and its tag sits at the ring's highest
 * point on the map that looks onto that level. Rings of one rise name the
 * same level at the same spot, so the rise is tagged once, and a slope
 * along part of a ring, a stair off a dais, names nothing of its own.
 * Design: docs/design.md §5 "Height is displayed per scene".
 */

import type { Point } from "../../shared/geometry.js";
import type { Topology } from "../derive.js";
import { sampleHeight, sampleWidth } from "../shapes.js";
import { contourGroups, type Contour, type Segment } from "./iso.js";

/** Where a tag goes, in cell coordinates, and the level it names. */
export interface TagPlace {
  readonly level: number;
  readonly top: Point;
}

// A ring reads the ground this many samples either side of it.
const TAG_REACH = 1.5;
// A contour shorter than this many cells of line is a speck of a slope,
// not a rise worth naming.
const TAG_LEAST_CELLS = 2;

// One stretch of a ring: its middle, how long it is, and the level the
// ground beyond it rounds to.
interface Stretch {
  readonly middle: Point;
  readonly length: number;
  readonly level: number;
}

/**
 * The tags for `contours`, the band rings at `band` apart: one for each
 * rise and each drop, at the top of its ring, naming the level beyond it.
 */
export function tagPlaces(
  topology: Topology,
  contours: readonly Contour[],
  band: number
): TagPlace[] {
  const ground = groundReader(topology);
  const reach = TAG_REACH / topology.samples.per;
  const least = TAG_LEAST_CELLS * topology.samples.per;
  const seen = new Set<string>();
  const places: TagPlace[] = [];
  for (const { threshold, segments } of contours) {
    for (const ring of contourGroups(segments)) {
      if (ring.length < least) {
        continue;
      }
      const stretches = ring.map((segment) => stretchOf(segment, threshold, band, reach, ground));
      const level = mostOf(stretches);
      const top = topOf(stretches, level);
      if (level === 0 || top === undefined) {
        continue;
      }
      const key = `${level}:${Math.round(top.x)}:${Math.round(top.y)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      places.push({ level, top });
    }
  }
  return places;
}

// The field at a point in cell coordinates, held to the map's edge.
function groundReader(topology: Topology): (x: number, y: number) => number {
  const { samples, field } = topology;
  const width = sampleWidth(samples);
  const height = sampleHeight(samples);
  return (x, y) => {
    const i = Math.max(
      0,
      Math.min(width - 1, Math.floor((x - samples.bounds.colMin) * samples.per))
    );
    const j = Math.max(
      0,
      Math.min(height - 1, Math.floor((y - samples.bounds.rowMin) * samples.per))
    );
    return field[j * width + i] ?? 0;
  };
}

// The ground beyond a stretch, read square to it either side: the higher
// of the two round a rise, the lower round a drop, to the nearest band.
function stretchOf(
  segment: Segment,
  threshold: number,
  band: number,
  reach: number,
  ground: (x: number, y: number) => number
): Stretch {
  const { from, to } = segment;
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  // Square to the stretch; a stretch with no length reads up and down.
  const across =
    length === 0
      ? { x: 0, y: reach }
      : { x: (-(to.y - from.y) / length) * reach, y: ((to.x - from.x) / length) * reach };
  const one = ground(middle.x + across.x, middle.y + across.y);
  const other = ground(middle.x - across.x, middle.y - across.y);
  const beyond = threshold > 0 ? Math.max(one, other) : Math.min(one, other);
  return { middle, length, level: Math.round(beyond / band) * band };
}

// The level most of a ring's length looks onto; a tie goes to the level
// met first.
function mostOf(stretches: readonly Stretch[]): number {
  const lengths = new Map<number, number>();
  for (const { level, length } of stretches) {
    lengths.set(level, (lengths.get(level) ?? 0) + length);
  }
  let most = 0;
  let longest = -1;
  for (const [level, length] of lengths) {
    if (length > longest) {
      most = level;
      longest = length;
    }
  }
  return most;
}

// The highest point on the map of the stretches that look onto `level`,
// the first met where two are level.
function topOf(stretches: readonly Stretch[], level: number): Point | undefined {
  let top: Point | undefined;
  for (const stretch of stretches) {
    if (stretch.level === level && (top === undefined || stretch.middle.y < top.y)) {
      top = stretch.middle;
    }
  }
  return top;
}
