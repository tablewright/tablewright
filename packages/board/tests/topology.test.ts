import { describe, expect, test } from "bun:test";
import type { Stroke } from "@tablewright/schema";
import {
  SAMPLES_PER_CELL,
  derive,
  edgeAt,
  edgeBetween,
  edgeKey,
  groundAt,
  heightAt,
  isLevelChangeAt,
  mansionStrokes,
  pointInPolygon,
  rectEdges,
  visibleTo,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };

const groundRect = (
  state: "ground" | "difficult" | "air" | "void",
  col0: number,
  row0: number,
  col1: number,
  row1: number
): Stroke => ({
  ink: "ground",
  shape: { kind: "rect", rect: { col0, row0, col1, row1 } },
  state,
  visibility: "party",
});

const heightRect = (
  value: number,
  col0: number,
  row0: number,
  col1: number,
  row1: number
): Stroke => ({
  ink: "height",
  shape: { kind: "rect", rect: { col0, row0, col1, row1 } },
  value,
  visibility: "party",
});

describe("edges", () => {
  test("the edge between two neighbours has the same name from either side", () => {
    const a = { col: 3, row: 4 };
    expect(edgeBetween(a, { col: 4, row: 4 })).toEqual(edgeBetween({ col: 4, row: 4 }, a));
    expect(edgeBetween(a, { col: 3, row: 5 })).toEqual({ col: 3, row: 4, side: "south" });
    expect(edgeBetween(a, { col: 3, row: 3 })).toEqual({ col: 3, row: 3, side: "south" });
    expect(edgeBetween(a, { col: 4, row: 5 })).toBeUndefined();
  });

  test("a wall rect makes a wall on each cell of its four sides", () => {
    const topology = derive(
      [
        {
          ink: "wall",
          shape: { kind: "rect", rect: { col0: 2, row0: 2, col1: 4, row1: 3 } },
          visibility: "party",
        },
      ],
      bounds
    );
    // Three cells along the top and bottom, two down each side.
    expect(topology.edges.size).toBe(10);
    expect(edgeAt(topology, { col: 3, row: 1, side: "south" })?.kind).toBe("wall");
    expect(edgeAt(topology, { col: 3, row: 3, side: "south" })?.kind).toBe("wall");
    expect(edgeAt(topology, { col: 1, row: 2, side: "east" })?.kind).toBe("wall");
    expect(edgeAt(topology, { col: 4, row: 3, side: "east" })?.kind).toBe("wall");
    expect(edgeAt(topology, { col: 3, row: 2, side: "south" })).toBeUndefined();
    expect(rectEdges({ col0: 0, row0: 0, col1: 0, row1: 0 }).map(edgeKey).sort()).toEqual([
      "east:-1:0",
      "east:0:0",
      "south:0:-1",
      "south:0:0",
    ]);
  });

  test("a threshold replaces the wall on its edge", () => {
    const topology = derive(
      [
        {
          ink: "wall",
          shape: { kind: "rect", rect: { col0: 2, row0: 2, col1: 4, row1: 3 } },
          visibility: "party",
        },
        {
          ink: "threshold",
          edge: { col: 4, row: 2, side: "east" },
          kind: "door",
          state: "locked",
          size: "small",
          visibility: "party",
        },
      ],
      bounds
    );
    expect(edgeAt(topology, { col: 4, row: 2, side: "east" })).toEqual({
      edge: { col: 4, row: 2, side: "east" },
      kind: "threshold",
      threshold: "door",
      state: "locked",
      size: "small",
    });
    expect(topology.edges.size).toBe(10);
  });
});

describe("ground", () => {
  test("everything is void until ground is drawn, and a later stroke overrides an earlier", () => {
    const topology = derive(
      [groundRect("ground", 1, 1, 5, 5), groundRect("difficult", 2, 2, 3, 3)],
      bounds
    );
    expect(groundAt(topology, { col: 0, row: 0 })).toBe("void");
    expect(groundAt(topology, { col: 1, row: 1 })).toBe("ground");
    expect(groundAt(topology, { col: 2, row: 3 })).toBe("difficult");
    expect(groundAt(topology, { col: 4, row: 4 })).toBe("ground");
    expect(groundAt(topology, { col: 40, row: 40 })).toBe("void");
  });

  test("a free shape takes the cells whose centres it encloses", () => {
    const triangle: Stroke = {
      ink: "ground",
      shape: {
        kind: "free",
        points: [
          { x: 1, y: 1 },
          { x: 6, y: 1 },
          { x: 1, y: 6 },
        ],
      },
      state: "ground",
      visibility: "party",
    };
    const topology = derive([triangle], bounds);
    expect(groundAt(topology, { col: 1, row: 1 })).toBe("ground");
    expect(groundAt(topology, { col: 2, row: 2 })).toBe("ground");
    expect(groundAt(topology, { col: 4, row: 4 })).toBe("void");
    expect(groundAt(topology, { col: 5, row: 1 })).toBe("void");
    const corners = [
      { x: 1, y: 1 },
      { x: 6, y: 1 },
      { x: 1, y: 6 },
    ];
    expect(pointInPolygon({ x: 2, y: 2 }, corners)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 5 }, corners)).toBe(false);
  });

  test("a brush dab covers the cells within its radius", () => {
    const dab = (radius: number): Stroke => ({
      ink: "ground",
      shape: { kind: "brush", points: [{ x: 3.5, y: 3.5 }], radius },
      state: "ground",
      visibility: "party",
    });
    const narrow = derive([dab(0.6)], bounds);
    expect(groundAt(narrow, { col: 3, row: 3 })).toBe("ground");
    expect(groundAt(narrow, { col: 4, row: 3 })).toBe("void");
    const wide = derive([dab(1.2)], bounds);
    expect(groundAt(wide, { col: 4, row: 3 })).toBe("ground");
    expect(groundAt(wide, { col: 2, row: 3 })).toBe("ground");
    expect(groundAt(wide, { col: 4, row: 4 })).toBe("void");
  });
});

describe("the field", () => {
  test("a height rect writes every sample of its cells", () => {
    const topology = derive([heightRect(10, 1, 1, 2, 1)], bounds);
    const written = topology.field.reduce((count, value) => count + (value === 10 ? 1 : 0), 0);
    expect(written).toBe(2 * SAMPLES_PER_CELL * SAMPLES_PER_CELL);
    expect(heightAt(topology, { col: 1, row: 1 })).toBe(10);
    expect(heightAt(topology, { col: 2, row: 1 })).toBe(10);
    expect(heightAt(topology, { col: 3, row: 1 })).toBe(0);
    expect(heightAt(topology, { col: -1, row: -1 })).toBe(0);
  });

  test("a level change slopes between the heights beside it and marks the cells", () => {
    const stairs: Stroke = {
      ink: "level-change",
      shape: {
        kind: "brush",
        points: [
          { x: 3.5, y: 2.5 },
          { x: 4.5, y: 2.5 },
        ],
        radius: 0.6,
      },
      visibility: "party",
    };
    const topology = derive(
      [heightRect(10, 0, 0, 3, 5), heightRect(0, 4, 0, 8, 5), stairs],
      bounds
    );
    const left = heightAt(topology, { col: 3, row: 2 });
    const right = heightAt(topology, { col: 4, row: 2 });
    expect(left).toBeGreaterThan(right);
    expect(left).toBeLessThan(10);
    expect(right).toBeGreaterThan(0);
    expect(isLevelChangeAt(topology, { col: 3, row: 2 })).toBe(true);
    expect(isLevelChangeAt(topology, { col: 2, row: 2 })).toBe(false);
    expect(heightAt(topology, { col: 2, row: 2 })).toBe(10);
  });
});

describe("visibility", () => {
  test("strokes above the viewer's tier are left out", () => {
    const secret: Stroke = {
      ink: "threshold",
      edge: { col: 4, row: 2, side: "east" },
      kind: "door",
      state: "secret",
      size: "small",
      visibility: "dm",
    };
    const floor = groundRect("ground", 0, 0, 9, 9);
    const strokes = [floor, secret];
    expect(visibleTo(strokes, "party")).toEqual([floor]);
    expect(visibleTo(strokes, "dm")).toEqual(strokes);
  });
});

describe("the mansion", () => {
  test("every threshold opens onto ground on at least one side", () => {
    const topology = derive(mansionStrokes(), bounds);
    const thresholds = [...topology.edges.values()].filter((data) => data.kind === "threshold");
    expect(thresholds.length).toBe(13);
    for (const data of thresholds) {
      const { edge } = data;
      const near = groundAt(topology, { col: edge.col, row: edge.row });
      const far = groundAt(
        topology,
        edge.side === "east"
          ? { col: edge.col + 1, row: edge.row }
          : { col: edge.col, row: edge.row + 1 }
      );
      expect([near, far]).toContain("ground");
    }
    expect(heightAt(topology, { col: 4, row: 1 })).toBe(10);
    expect(heightAt(topology, { col: 14, row: 9 })).toBe(-10);
    expect(isLevelChangeAt(topology, { col: 9, row: 1 })).toBe(true);
    expect(groundAt(topology, { col: 0, row: 0 })).toBe("void");
  });
});

// A budget two orders above the work, guarding the complexity rather than
// a frame: only deriving every stroke over every cell would trip it.
describe("derivation at map scale", () => {
  test("five hundred strokes over sixty by forty cells derive quickly", () => {
    const big = { colMin: 0, rowMin: 0, cols: 60, rows: 40 };
    const room = mansionStrokes();
    const strokes = Array.from({ length: 500 }, (_, i) => room[i % room.length]).filter(
      (stroke): stroke is Stroke => stroke !== undefined
    );
    const start = performance.now();
    const topology = derive(strokes, big);
    const ms = performance.now() - start;
    console.log(`500 strokes on 60 x 40 derived in ${ms.toFixed(2)} ms`);
    expect(topology.edges.size).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  });
});
