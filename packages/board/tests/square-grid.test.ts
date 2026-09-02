import { describe, expect, test } from "bun:test";
import {
  cellCenter,
  cellToWorld,
  snapToCellCenter,
  worldToCell,
  type SquareGrid,
} from "../src/index.js";

const grid: SquareGrid = { cellSize: 50, originX: 0, originY: 0 };
const offsetGrid: SquareGrid = { cellSize: 50, originX: 10, originY: -20 };

describe("worldToCell", () => {
  test("a point inside a cell maps to that cell", () => {
    expect(worldToCell(grid, { x: 75, y: 120 })).toEqual({ col: 1, row: 2 });
  });

  test("a point on the left or top edge belongs to the cell it starts", () => {
    expect(worldToCell(grid, { x: 50, y: 100 })).toEqual({ col: 1, row: 2 });
  });

  test("negative coordinates floor away from zero, not toward it", () => {
    expect(worldToCell(grid, { x: -1, y: -51 })).toEqual({ col: -1, row: -2 });
  });

  test("the origin offset shifts the whole lattice", () => {
    expect(worldToCell(offsetGrid, { x: 9, y: -21 })).toEqual({ col: -1, row: -1 });
    expect(worldToCell(offsetGrid, { x: 10, y: -20 })).toEqual({ col: 0, row: 0 });
  });
});

describe("cellToWorld and cellCenter", () => {
  test("cellToWorld gives the top-left corner of the cell", () => {
    expect(cellToWorld(grid, { col: 3, row: 1 })).toEqual({ x: 150, y: 50 });
    expect(cellToWorld(offsetGrid, { col: 0, row: 0 })).toEqual({ x: 10, y: -20 });
  });

  test("cellCenter sits half a cell in from the corner", () => {
    expect(cellCenter(grid, { col: 3, row: 1 })).toEqual({ x: 175, y: 75 });
  });

  test("a corner round-trips through worldToCell", () => {
    const cell = { col: -4, row: 7 };
    expect(worldToCell(offsetGrid, cellToWorld(offsetGrid, cell))).toEqual(cell);
  });
});

describe("snapToCellCenter", () => {
  test("snaps any point inside a cell to the centre of that cell", () => {
    expect(snapToCellCenter(grid, { x: 51, y: 99 })).toEqual({ x: 75, y: 75 });
    expect(snapToCellCenter(grid, { x: 99, y: 51 })).toEqual({ x: 75, y: 75 });
  });

  test("honours the origin offset", () => {
    expect(snapToCellCenter(offsetGrid, { x: 12, y: -18 })).toEqual({ x: 35, y: 5 });
  });

  test("a point already at a centre stays there", () => {
    expect(snapToCellCenter(grid, { x: 25, y: 25 })).toEqual({ x: 25, y: 25 });
  });
});
