/**
 * ─ Terrace Hill ─
 *
 * The Terrace Hill mock's hill as strokes: four rings of height, each a
 * free shape wobbling on its own, and three stairs cut through them as
 * level changes. The reference drawing for an organic map, where nothing
 * lines up with a cell; the mock's twenty-four columns fitted to the
 * tavern's twenty.
 */

import type { Point, Stroke } from "@tablewright/schema";

interface Ring {
  readonly radius: number;
  /** Sine terms bending the ring: harmonic, amplitude in cells, phase. */
  readonly wobble: readonly (readonly [number, number, number])[];
  readonly level: number;
}

const CENTRE = { x: 10, y: 7.5 };
const SCALE = 0.85;
const RINGS: readonly Ring[] = [
  {
    radius: 8.6,
    wobble: [
      [3, 0.9, 0.3],
      [5, 0.5, 1.7],
    ],
    level: 5,
  },
  {
    radius: 6.9,
    wobble: [
      [2, 0.8, 1.1],
      [4, 0.6, 0.4],
    ],
    level: 10,
  },
  {
    radius: 5.1,
    wobble: [
      [3, 0.7, 2.3],
      [6, 0.35, 0.9],
    ],
    level: 15,
  },
  {
    radius: 3.2,
    wobble: [
      [2, 0.6, 0.2],
      [5, 0.3, 2.8],
    ],
    level: 20,
  },
];
// Where the stairs cut through, as angles from the crown.
const STAIRS = [-1.1, 0.9, 2.6];
const CORNERS = 64;
const DAB_STEP = 0.4;

function ringRadius(ring: Ring, theta: number): number {
  let radius = ring.radius;
  for (const [harmonic, amplitude, phase] of ring.wobble) {
    radius += Math.sin(theta * harmonic + phase) * amplitude * 0.45;
  }
  return radius * SCALE;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function ringPolygon(ring: Ring): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < CORNERS; i += 1) {
    const theta = (i / CORNERS) * Math.PI * 2 - Math.PI;
    const radius = ringRadius(ring, theta);
    points.push({
      x: round(CENTRE.x + Math.cos(theta) * radius),
      y: round(CENTRE.y + Math.sin(theta) * radius),
    });
  }
  return points;
}

// Dabs from just outside the lowest ring to just inside the crown.
function stairDabs(angle: number): Point[] {
  const outer = RINGS[0];
  const inner = RINGS[RINGS.length - 1];
  if (outer === undefined || inner === undefined) {
    return [];
  }
  const from = ringRadius(outer, angle) + 0.3;
  const to = ringRadius(inner, angle) - 0.2;
  const dabs: Point[] = [];
  for (let distance = from; distance >= to; distance -= DAB_STEP) {
    dabs.push({
      x: round(CENTRE.x + Math.cos(angle) * distance),
      y: round(CENTRE.y + Math.sin(angle) * distance),
    });
  }
  return dabs;
}

/** The hill as the strokes a DM would have painted over its picture. */
export function terraceHillStrokes(): Stroke[] {
  const strokes: Stroke[] = [
    {
      ink: "ground",
      shape: { kind: "rect", rect: { col0: 0, row0: 0, col1: 19, row1: 14 } },
      state: "ground",
      look: "both",
      visibility: "party",
    },
  ];
  for (const ring of RINGS) {
    strokes.push({
      ink: "height",
      shape: { kind: "free", points: ringPolygon(ring) },
      value: ring.level,
      visibility: "party",
    });
  }
  for (const angle of STAIRS) {
    strokes.push({
      ink: "level-change",
      look: "both",
      shape: { kind: "brush", points: stairDabs(angle), radius: 0.6 },
      visibility: "party",
    });
  }
  return strokes;
}
