import { describe, expect, test } from "bun:test";
import { gridLines, snapToCellCenter, visibleExtent, type SquareGrid } from "../src/index.js";

// Deterministic guards against algorithmic regressions, not frame budgets: the
// budgets are two orders of magnitude above what the work costs on any CPU, so
// only a change in complexity, such as rebuilding every cell instead of the
// visible ones, can trip them.

const grid: SquareGrid = { cellSize: 50, originX: 0, originY: 0 };
const bounds = { colMin: 0, rowMin: 0, cols: 200, rows: 200 };

function timed(work: () => void): number {
  const start = performance.now();
  work();
  return performance.now() - start;
}

describe("grid math at a 200 x 200 map", () => {
  test("a full rebuild of the visible lines stays cheap", () => {
    const view = { left: 0, top: 0, right: 10_000, bottom: 10_000 };
    const ms = timed(() => {
      for (let i = 0; i < 100; i += 1) {
        const extent = visibleExtent(grid, view, bounds);
        expect(extent).toBeDefined();
        if (extent !== undefined) {
          gridLines(grid, extent);
        }
      }
    });
    expect(ms).toBeLessThan(200);
  });

  test("snapping a drag stream is negligible", () => {
    const ms = timed(() => {
      for (let i = 0; i < 100_000; i += 1) {
        snapToCellCenter(grid, { x: i % 9973, y: (i * 7) % 9973 });
      }
    });
    expect(ms).toBeLessThan(200);
  });
});
