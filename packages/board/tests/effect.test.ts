import { describe, expect, test } from "bun:test";
import type { ThresholdPlay } from "@tablewright/schema";
import {
  cellCentre,
  derive,
  edgeAt,
  firstBlock,
  hasLineOfEffect,
  hasLineOfSight,
  mansionStrokes,
  passes,
  type Cell,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const mansion = (play: ThresholdPlay[] = []) => derive(mansionStrokes(), bounds, play);
const at = (col: number, row: number): Cell => ({ col, row });

describe("what an edge lets through", () => {
  const house = mansion();
  const edge = (col: number, row: number, side: "east" | "south") =>
    edgeAt(house, { col, row, side });

  test("a wall stops everything and an arch nothing", () => {
    for (const passage of ["move", "sight", "effect"] as const) {
      expect(passes(edge(8, 8, "east"), passage)).toBe(false);
      expect(passes(edge(4, 11, "south"), passage)).toBe(true);
      expect(passes(undefined, passage)).toBe(true);
    }
  });

  test("a door lets all through open and nothing shut, locked or secret", () => {
    for (const passage of ["move", "sight", "effect"] as const) {
      expect(passes(edge(8, 7, "east"), passage)).toBe(true);
      expect(passes(edge(15, 6, "south"), passage)).toBe(false);
      expect(passes(edge(10, 3, "east"), passage)).toBe(false);
      expect(passes(edge(16, 11, "south"), passage)).toBe(false);
    }
  });

  test("a window shows the room beyond shut, and lets more through open or smashed", () => {
    const large = edge(18, 2, "east");
    expect(passes(large, "sight")).toBe(true);
    expect(passes(large, "effect")).toBe(false);
    expect(passes(large, "move")).toBe(false);
    const smashed = edgeAt(
      mansion([{ edge: { col: 18, row: 2, side: "east" }, state: "smashed" }]),
      {
        col: 18,
        row: 2,
        side: "east",
      }
    );
    expect(passes(smashed, "effect")).toBe(true);
    expect(passes(smashed, "move")).toBe(true);
    const openSmall = edgeAt(mansion([{ edge: { col: 0, row: 6, side: "east" }, state: "open" }]), {
      col: 0,
      row: 6,
      side: "east",
    });
    expect(passes(openSmall, "effect")).toBe(true);
    expect(passes(openSmall, "move")).toBe(false);
  });
});

describe("a straight line across the mansion", () => {
  test("stops at the first wall in its way and says where", () => {
    const house = mansion();
    expect(hasLineOfEffect(house, at(3, 8), at(12, 8))).toBe(false);
    const block = firstBlock(house, cellCentre(at(3, 8)), cellCentre(at(12, 8)), "effect");
    expect(block?.edge.edge).toEqual({ col: 8, row: 8, side: "east" });
    expect(block?.at).toEqual({ x: 9, y: 8.5 });
    expect(block?.t).toBeCloseTo(5.5 / 9, 6);
  });

  test("passes an open door and stops at the wall beyond", () => {
    const house = mansion();
    expect(hasLineOfEffect(house, at(3, 7), at(9, 7))).toBe(true);
    expect(hasLineOfSight(house, at(3, 7), at(9, 7))).toBe(true);
    const block = firstBlock(house, cellCentre(at(3, 7)), cellCentre(at(12, 7)), "effect");
    expect(block?.edge.edge).toEqual({ col: 10, row: 7, side: "east" });
  });

  test("a shut door blocks sight until play opens it; an arch never did", () => {
    expect(hasLineOfSight(mansion(), at(15, 5), at(15, 8))).toBe(false);
    const opened = mansion([{ edge: { col: 15, row: 6, side: "south" }, state: "open" }]);
    expect(hasLineOfSight(opened, at(15, 5), at(15, 8))).toBe(true);
    expect(hasLineOfEffect(mansion(), at(4, 10), at(4, 13))).toBe(true);
  });

  test("a secret door is a wall until it is worked", () => {
    expect(hasLineOfSight(mansion(), at(16, 10), at(16, 12))).toBe(false);
    const worked = mansion([{ edge: { col: 16, row: 11, side: "south" }, state: "open" }]);
    expect(hasLineOfSight(worked, at(16, 10), at(16, 12))).toBe(true);
  });

  test("a line along a wall is beside it, not through it", () => {
    // Along the hall's south wall inside the hall, edge to edge of the arches.
    const house = mansion();
    expect(
      firstBlock(house, { x: 1.5, y: 12 - 1e-6 }, { x: 8.5, y: 12 - 1e-6 }, "effect")
    ).toBeUndefined();
  });
});
