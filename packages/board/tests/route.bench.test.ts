import { describe, expect, test } from "bun:test";
import type { Stroke } from "@tablewright/schema";
import { DEFAULT_MOVER, DEFAULT_RULE, derive, findRoute, reach } from "../src/index.js";

// Deterministic guards against algorithmic regressions, not frame budgets:
// the budgets sit an order of magnitude above what the work costs here, so
// only a change in complexity can trip them. The plan's targets are a route
// under 3 ms and the reach set under 10 ms on a 200 by 200 map.

const bounds = { colMin: 0, rowMin: 0, cols: 200, rows: 200 };
const open: Stroke[] = [
  {
    ink: "ground",
    look: "data",
    shape: { kind: "rect", rect: { col0: 0, row0: 0, col1: 199, row1: 199 } },
    state: "ground",
    visibility: "party",
  },
];

function timed(work: () => void): number {
  const start = performance.now();
  work();
  return performance.now() - start;
}

describe("routes at a 200 x 200 map", () => {
  const field = derive(open, bounds);

  test("corner to corner is one straight diagonal, found quickly", () => {
    let cost = 0;
    const ms = timed(() => {
      for (let i = 0; i < 10; i += 1) {
        cost =
          findRoute(field, { col: 0, row: 0 }, { col: 199, row: 199 }, DEFAULT_MOVER, DEFAULT_RULE)
            ?.cost ?? 0;
      }
    });
    expect(cost).toBe(199 * 5);
    expect(ms / 10).toBeLessThan(30);
  });

  test("a dash's reach is a moment, and the whole map's a fraction of a frame per cell", () => {
    let dashed = 0;
    const dashMs = timed(() => {
      for (let i = 0; i < 10; i += 1) {
        const costs = reach(field, { col: 100, row: 100 }, DEFAULT_MOVER, DEFAULT_RULE, 60);
        dashed = costs.filter((cost) => cost !== Infinity).length;
      }
    });
    // Twelve cells every way from the middle.
    expect(dashed).toBe(25 * 25);
    expect(dashMs / 10).toBeLessThan(20);
    let reached = 0;
    const mapMs = timed(() => {
      const costs = reach(field, { col: 100, row: 100 }, DEFAULT_MOVER, DEFAULT_RULE, 500);
      reached = costs.filter((cost) => cost !== Infinity).length;
    });
    expect(reached).toBe(200 * 200);
    expect(mapMs).toBeLessThan(400);
  });
});
