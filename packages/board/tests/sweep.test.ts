import { describe, expect, test } from "bun:test";
import type { Stroke } from "@tablewright/schema";
import { derive, mansionStrokes, sweep, type CellSpot, type Point } from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const spot = (x: number, y: number, z: number): CellSpot => ({ x, y, z });

// A fan of far points `reach` cells out, every `step` degrees from `from`
// to `to`, degrees clockwise from north as an aim is read.
const fan = (origin: CellSpot, reach: number, from: number, to: number, step: number) => {
  const far: CellSpot[] = [];
  for (let turn = from; turn <= to + 1e-9; turn += step) {
    const radians = (turn * Math.PI) / 180;
    far.push(
      spot(origin.x + Math.sin(radians) * reach, origin.y - Math.cos(radians) * reach, origin.z)
    );
  }
  return far;
};

const near = (ring: readonly Point[], x: number, y: number, within = 1e-3) =>
  ring.some((point) => Math.abs(point.x - x) <= within && Math.abs(point.y - y) <= within);

describe("the sweep", () => {
  // One wall of its own on a bare map: the line x = 5 from y = 6 to 7.
  const lone = derive(
    [
      {
        ink: "wall",
        shape: { kind: "line", edges: [{ col: 4, row: 6, side: "east" }] },
        look: "data",
        visibility: "party",
      } satisfies Stroke,
    ],
    bounds
  );
  const origin = spot(3.5, 6.5, 2.5);
  const loop = fan(origin, 4, 0, 330, 30);

  test("with nothing in its way, the ring is the footprint's own", () => {
    const ring = sweep(derive([], bounds), origin, loop);
    expect(ring).toHaveLength(loop.length);
    ring.forEach((point, index) => {
      expect(point.x).toBeCloseTo(loop[index]?.x ?? NaN, 9);
      expect(point.y).toBeCloseTo(loop[index]?.y ?? NaN, 9);
    });
  });

  test("a ray stops where its line does", () => {
    const ring = sweep(lone, origin, loop);
    // Due east, the ray meets the wall a cell and a half out.
    const east = ring.find((point) => Math.abs(point.y - 6.5) < 1e-9);
    expect(east?.x).toBeCloseTo(5, 9);
    // Every other way is open, and the ray reaches its far point.
    expect(near(ring, 3.5, 10.5)).toBe(true);
    expect(near(ring, -0.5, 6.5)).toBe(true);
  });

  test("a wall's end cuts the ring cleanly, a hair to either side of it", () => {
    const ring = sweep(lone, origin, loop);
    // Twelve rays, and two more at each of the wall's two ends.
    expect(ring).toHaveLength(16);
    expect(near(ring, 5, 6)).toBe(true);
    expect(near(ring, 5, 7)).toBe(true);
    // Past the south end the ring steps straight out to the far edge
    // rather than drifting to the next ray.
    const atEnd = ring.findIndex((point) => near([point], 5, 7));
    const beyond = ring[atEnd + 1];
    expect(beyond?.x ?? 0).toBeGreaterThan(7);
  });

  test("an end hidden behind a nearer wall adds nothing", () => {
    const behind = derive(
      [
        {
          ink: "wall",
          shape: {
            kind: "line",
            edges: [
              { col: 4, row: 6, side: "east" },
              { col: 6, row: 6, side: "east" },
            ],
          },
          look: "data",
          visibility: "party",
        } satisfies Stroke,
      ],
      bounds
    );
    expect(sweep(behind, origin, loop)).toHaveLength(16);
  });

  test("an end on or beyond the footprint's edge cuts nothing inside it", () => {
    // The same wall, with the far points pulled in short of it.
    const ring = sweep(lone, origin, fan(origin, 1, 0, 330, 30));
    expect(ring).toHaveLength(12);
  });

  test("the ring keeps the origin as a point where the footprint starts from it", () => {
    const ring = sweep(lone, origin, [origin, ...fan(origin, 4, 60, 120, 30)]);
    expect(ring[0]).toEqual({ x: 3.5, y: 6.5 });
  });
});

describe("a cone breathed down the mansion's hall", () => {
  const house = derive(mansionStrokes(), bounds);

  test("from the gallery's end, the ring is cut at the wall and the secret door, and runs through the open door", () => {
    // From the middle of the cube over the gallery's east end, aimed west,
    // eighteen cells out: the hall's whole length.
    const from = spot(18.5, 12.5, 7.5);
    const ring = sweep(house, from, [from, ...fan(from, 18, 270 - 26.5, 270 + 26.5, 4)]);
    // The hall's north wall is the line y = 12. The secret door is its
    // stretch from x = 16 to 17, shut until it is worked.
    const onWall = ring.filter((point) => Math.abs(point.y - 12) < 1e-6);
    expect(onWall.some((point) => point.x > 16 && point.x < 17)).toBe(true);
    expect(onWall.some((point) => point.x > 17 && point.x < 18)).toBe(true);
    // Both ends of the secret door cut the ring, as the wall's ends do.
    expect(near(ring, 16, 12)).toBe(true);
    expect(near(ring, 17, 12)).toBe(true);
    // Through the open door at x = 9 to 10, the ray goes on into the
    // corridor and stops at its far wall.
    expect(ring.some((point) => Math.abs(point.x - 9) < 1e-6 && point.y < 12)).toBe(true);
    // North of the wall the ring reaches only through that door and the
    // arches west of it: nothing of it lies over the room beyond the
    // secret door.
    for (const point of ring) {
      if (point.y < 12 - 1e-6) {
        expect(point.x).toBeLessThanOrEqual(10 + 1e-6);
      }
    }
    // Down the hall to its west wall, over the floor five feet below.
    expect(ring.some((point) => Math.abs(point.x - 1) < 1e-6)).toBe(true);
  });
});
