import { describe, expect, test } from "bun:test";
import { gridLines, type CellExtent, type SquareGrid } from "../src/index.js";

const grid: SquareGrid = { cellSize: 50, originX: 0, originY: 0 };
const offsetGrid: SquareGrid = { cellSize: 50, originX: 10, originY: -20 };

describe("gridLines", () => {
  test("has one more line than cells on each axis", () => {
    const lines = gridLines(grid, { colMin: 0, rowMin: 0, cols: 4, rows: 3 });
    expect(lines.xs).toHaveLength(5);
    expect(lines.ys).toHaveLength(4);
  });

  test("places lines on cell boundaries from the origin", () => {
    const lines = gridLines(grid, { colMin: 0, rowMin: 0, cols: 2, rows: 1 });
    expect(lines.xs).toEqual([0, 50, 100]);
    expect(lines.ys).toEqual([0, 50]);
  });

  test("starts at the extent's first cell, not at the grid origin", () => {
    const extent: CellExtent = { colMin: 3, rowMin: -1, cols: 2, rows: 2 };
    const lines = gridLines(offsetGrid, extent);
    expect(lines.xs).toEqual([160, 210, 260]);
    expect(lines.ys).toEqual([-70, -20, 30]);
  });

  test("bounds span exactly the outlined extent", () => {
    const lines = gridLines(offsetGrid, { colMin: 1, rowMin: 1, cols: 3, rows: 2 });
    expect([lines.left, lines.top, lines.right, lines.bottom]).toEqual([60, 30, 210, 130]);
  });

  test("an empty extent still yields its single boundary line", () => {
    const lines = gridLines(grid, { colMin: 0, rowMin: 0, cols: 0, rows: 0 });
    expect(lines.xs).toEqual([0]);
    expect(lines.ys).toEqual([0]);
  });
});
