import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MOVER,
  DEFAULT_RULE,
  derive,
  mansionStrokes,
  measure,
  pickRoute,
  trailScore,
  type Point,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const house = derive(mansionStrokes(), bounds);
// From the gallery to the hall: straight down is a twenty-foot drop, and the
// way round the landing is fifty-five feet on foot. Both fit a thirty-foot
// move with a dash, so the drag is what picks.
const gallery = measure(house, { col: 6, row: 1 }, { col: 6, row: 5 }, DEFAULT_RULE, DEFAULT_MOVER);
const ways = gallery.ways;

const along = (...cells: readonly (readonly [number, number])[]): Point[] =>
  cells.map(([col, row]) => ({ x: col + 0.5, y: row + 0.5 }));

// Straight down the gallery wall, the way the drop goes.
const overTheEdge = along([6, 1], [6, 2], [6, 3], [6, 4], [6, 5]);
// Out east to the landing and back, the way the stairs go.
const roundTheLanding = along([7, 2], [9, 2], [9, 4], [9, 6], [8, 7], [7, 6], [6, 5]);
// Out along the landing, then back to the gallery and over the edge after all.
const changedMind = along(
  [7, 2],
  [8, 2],
  [9, 2],
  [8, 1],
  [7, 1],
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [6, 5]
);

describe("the way a drag went", () => {
  test("the gallery offers both ways, one of them a drop", () => {
    expect(ways.safe?.cost).toBe(55);
    expect(ways.quick?.cost).toBe(20);
    expect(ways.quick?.dice).toBe(1);
  });

  test("a drag over the edge takes the drop", () => {
    expect(pickRoute(ways, overTheEdge, "safe")).toBe("quick");
  });

  test("a drag round the landing takes the stairs", () => {
    expect(pickRoute(ways, roundTheLanding, "quick")).toBe("safe");
  });

  test("recent motion counts most, so a change of heart part way through flips the choice", () => {
    expect(pickRoute(ways, changedMind, "safe")).toBe("quick");
  });

  test("where the two ways run together neither wins, and the way already chosen stands", () => {
    // Both ways end at the same cell; a pointer dithering there says nothing.
    const dithering = along([6, 5], [6, 5], [6, 5], [6, 5]);
    expect(pickRoute(ways, dithering, "safe")).toBe("safe");
    expect(pickRoute(ways, dithering, "quick")).toBe("quick");
  });

  test("a twitch decides nothing: the way already chosen stands", () => {
    expect(pickRoute(ways, overTheEdge.slice(0, 2), "safe")).toBe("safe");
    expect(pickRoute(ways, [], "quick")).toBe("quick");
  });

  test("one way alone is no choice at all", () => {
    expect(pickRoute({ safe: ways.safe }, overTheEdge, "safe")).toBe("safe");
  });

  test("a trail that hugs a way scores nearer than one that leaves it", () => {
    const drop = ways.quick;
    expect(drop).toBeDefined();
    if (drop !== undefined) {
      expect(trailScore(overTheEdge, drop)).toBeLessThan(0.01);
      expect(trailScore(roundTheLanding, drop)).toBeGreaterThan(trailScore(overTheEdge, drop));
    }
  });
});
