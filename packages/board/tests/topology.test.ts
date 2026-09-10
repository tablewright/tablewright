import { describe, expect, test } from "bun:test";
import type { Stroke } from "@tablewright/schema";
import {
  LEVEL_CHANGE_TEXTURED,
  SAMPLES_PER_CELL,
  derive,
  edgeAt,
  edgeBetween,
  edgeKey,
  groundAt,
  heightAt,
  isLevelChangeAt,
  isTexturedAt,
  mansionStrokes,
  pointInPolygon,
  rectEdges,
  terraceHillStrokes,
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
  look: "data",
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
          look: "data",
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
          look: "data",
          shape: { kind: "rect", rect: { col0: 2, row0: 2, col1: 4, row1: 3 } },
          visibility: "party",
        },
        {
          ink: "threshold",
          look: "data",
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
      look: "data",
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
      look: "data",
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

  test("a ground dab converts every cell its disc touches", () => {
    const dab = (radius: number): Stroke => ({
      ink: "ground",
      look: "data",
      shape: { kind: "brush", points: [{ x: 3.5, y: 3.5 }], radius },
      state: "ground",
      visibility: "party",
    });
    // Within the cell: only that cell.
    const narrow = derive([dab(0.4)], bounds);
    expect(groundAt(narrow, { col: 3, row: 3 })).toBe("ground");
    expect(groundAt(narrow, { col: 4, row: 3 })).toBe("void");
    // Past the cell's edge by a tenth: the four neighbours, not the corners.
    const wide = derive([dab(0.6)], bounds);
    expect(groundAt(wide, { col: 4, row: 3 })).toBe("ground");
    expect(groundAt(wide, { col: 2, row: 3 })).toBe("ground");
    expect(groundAt(wide, { col: 3, row: 2 })).toBe("ground");
    expect(groundAt(wide, { col: 4, row: 4 })).toBe("void");
  });

  test("a ground sweep converts every cell along its path, however thin", () => {
    const thin: Stroke = {
      ink: "ground",
      look: "data",
      shape: {
        kind: "brush",
        points: [
          { x: 1.2, y: 2.9 },
          { x: 4.8, y: 2.9 },
        ],
        radius: 0.01,
      },
      state: "ground",
      visibility: "party",
    };
    const topology = derive([thin], bounds);
    for (let col = 1; col <= 4; col += 1) {
      expect(groundAt(topology, { col, row: 2 })).toBe("ground");
    }
    expect(groundAt(topology, { col: 1, row: 3 })).toBe("void");
    expect(groundAt(topology, { col: 5, row: 2 })).toBe("void");
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
      look: "data",
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
      look: "data",
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

describe("the hill", () => {
  test("rises to twenty at its crown, and its stairs are level changes", () => {
    const topology = derive(terraceHillStrokes(), bounds);
    expect(heightAt(topology, { col: 10, row: 7 })).toBe(20);
    expect(heightAt(topology, { col: 0, row: 0 })).toBe(0);
    expect(groundAt(topology, { col: 0, row: 0 })).toBe("ground");
    let stairs = 0;
    for (let row = 0; row < bounds.rows; row += 1) {
      for (let col = 0; col < bounds.cols; col += 1) {
        if (isLevelChangeAt(topology, { col, row })) {
          stairs += 1;
        }
      }
    }
    expect(stairs).toBeGreaterThan(10);
  });
});

describe("a reset", () => {
  test("clears everything before it and leaves what comes after", () => {
    const topology = derive(
      [
        ...mansionStrokes(),
        { ink: "clear", visibility: "party" },
        groundRect("ground", 0, 0, 1, 1),
      ],
      bounds
    );
    expect(topology.edges.size).toBe(0);
    expect(heightAt(topology, { col: 4, row: 1 })).toBe(0);
    expect(groundAt(topology, { col: 5, row: 5 })).toBe("void");
    expect(groundAt(topology, { col: 0, row: 0 })).toBe("ground");
  });
});

describe("play", () => {
  test("a door worked in play takes its play state, and a secret door worked is revealed", () => {
    const strokes = mansionStrokes();
    const opened = { edge: { col: 15, row: 6, side: "south" as const }, state: "open" as const };
    const revealed = {
      edge: { col: 16, row: 11, side: "south" as const },
      state: "closed" as const,
    };
    const play = [opened, revealed];
    const dm = derive(visibleTo(strokes, "dm", play), bounds, play);
    const door = edgeAt(dm, opened.edge);
    expect(door?.kind === "threshold" ? door.state : undefined).toBe("open");
    const party = derive(visibleTo(strokes, "party", play), bounds, play);
    const secret = edgeAt(party, revealed.edge);
    expect(secret?.kind === "threshold" ? secret.state : undefined).toBe("closed");
    const hidden = derive(visibleTo(strokes, "party"), bounds);
    expect(edgeAt(hidden, revealed.edge)?.kind).toBe("wall");
  });
});

describe("data, and texture too", () => {
  test("a stroke's look reaches the cells, edges and slope it painted", () => {
    const topology = derive(
      [
        {
          ink: "ground",
          shape: { kind: "rect", rect: { col0: 1, row0: 1, col1: 4, row1: 4 } },
          state: "ground",
          look: "both",
          visibility: "party",
        },
        {
          ink: "ground",
          shape: { kind: "rect", rect: { col0: 3, row0: 3, col1: 4, row1: 4 } },
          state: "difficult",
          look: "data",
          visibility: "party",
        },
        {
          ink: "wall",
          shape: { kind: "line", edges: [{ col: 2, row: 1, side: "east" }] },
          look: "both",
          visibility: "party",
        },
        {
          ink: "threshold",
          edge: { col: 2, row: 2, side: "east" },
          kind: "door",
          state: "open",
          size: "small",
          look: "data",
          visibility: "party",
        },
        {
          ink: "level-change",
          shape: { kind: "brush", points: [{ x: 1.5, y: 3.5 }], radius: 0.4 },
          look: "both",
          visibility: "party",
        },
      ],
      bounds
    );
    expect(isTexturedAt(topology, { col: 1, row: 1 })).toBe(true);
    // The later data stroke took the cell's look with its state.
    expect(isTexturedAt(topology, { col: 4, row: 4 })).toBe(false);
    expect(isTexturedAt(topology, { col: 7, row: 7 })).toBe(false);
    expect(edgeAt(topology, { col: 2, row: 1, side: "east" })?.look).toBe("both");
    expect(edgeAt(topology, { col: 2, row: 2, side: "east" })?.look).toBe("data");
    expect(isLevelChangeAt(topology, { col: 1, row: 3 })).toBe(true);
    const centre = 3 * SAMPLES_PER_CELL + SAMPLES_PER_CELL / 2;
    const width = bounds.cols * SAMPLES_PER_CELL;
    expect(topology.levelChange[centre * width + SAMPLES_PER_CELL + SAMPLES_PER_CELL / 2]).toBe(
      LEVEL_CHANGE_TEXTURED
    );
  });
});
