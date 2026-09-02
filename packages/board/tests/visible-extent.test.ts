import { describe, expect, test } from "bun:test";
import { visibleExtent, type CellExtent, type SquareGrid } from "../src/index.js";

const grid: SquareGrid = { cellSize: 50, originX: 0, originY: 0 };
const bounds: CellExtent = { colMin: 0, rowMin: 0, cols: 40, rows: 30 };

describe("visibleExtent", () => {
  test("a view inside the scene covers every cell it touches, partial cells included", () => {
    const extent = visibleExtent(grid, { left: 120, top: 60, right: 380, bottom: 260 }, bounds);
    expect(extent).toEqual({ colMin: 2, rowMin: 1, cols: 6, rows: 5 });
  });

  test("a view hanging past the scene edge is clamped to the bounds", () => {
    const extent = visibleExtent(grid, { left: -300, top: -100, right: 120, bottom: 60 }, bounds);
    expect(extent).toEqual({ colMin: 0, rowMin: 0, cols: 3, rows: 2 });
  });

  test("a view wholly outside the scene yields nothing", () => {
    expect(visibleExtent(grid, { left: 5000, top: 0, right: 6000, bottom: 500 }, bounds)).toBe(
      undefined
    );
  });

  test("a view smaller than a cell still yields that cell", () => {
    const extent = visibleExtent(grid, { left: 110, top: 110, right: 120, bottom: 120 }, bounds);
    expect(extent).toEqual({ colMin: 2, rowMin: 2, cols: 1, rows: 1 });
  });

  test("honours a grid origin offset", () => {
    const offset: SquareGrid = { cellSize: 50, originX: 10, originY: 10 };
    const extent = visibleExtent(offset, { left: 0, top: 0, right: 100, bottom: 100 }, bounds);
    expect(extent).toEqual({ colMin: 0, rowMin: 0, cols: 2, rows: 2 });
  });
});
