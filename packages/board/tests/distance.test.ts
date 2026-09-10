import { describe, expect, test } from "bun:test";
import type { SystemManifest } from "@tablewright/schema";
import {
  DEFAULT_RULE,
  diagonalCost,
  distance,
  distanceBetween,
  gridRuleOf,
  type GridRule,
} from "../src/index.js";

const ruled = (diagonals: GridRule["diagonals"]): GridRule => ({ ...DEFAULT_RULE, diagonals });
const place = (col: number, row: number, height = 0) => ({ col, row, height });

describe("distance under the rule", () => {
  test("three across and four down is the greatest axis, or half the rest more, or the true length", () => {
    expect(distance(place(0, 0), place(3, 4), ruled("equal"))).toBe(20);
    expect(distance(place(0, 0), place(3, 4), ruled("alternate"))).toBe(25);
    expect(distance(place(0, 0), place(3, 4), ruled("exact"))).toBe(25);
  });

  test("height is a third axis, taken the same way", () => {
    expect(distance(place(0, 0), place(3, 4, 20), ruled("equal"))).toBe(20);
    expect(distance(place(0, 0), place(3, 4, 20), ruled("alternate"))).toBe(35);
    expect(distance(place(0, 0), place(3, 4, 20), ruled("exact"))).toBeCloseTo(32.02, 2);
    expect(distance(place(0, 0), place(0, 0, 30), ruled("equal"))).toBe(30);
  });

  test("between two things it is the least between the cells they occupy", () => {
    const big = [place(0, 0), place(1, 0), place(0, 1), place(1, 1)];
    expect(distanceBetween(big, [place(3, 3)], ruled("equal"))).toBe(10);
    expect(distanceBetween([], [place(3, 3)], ruled("equal"))).toBe(Infinity);
  });

  test("a diagonal step costs by the rule and, alternating, by how many came before", () => {
    expect(diagonalCost(ruled("equal"), 0)).toBe(5);
    expect(diagonalCost(ruled("alternate"), 0)).toBe(5);
    expect(diagonalCost(ruled("alternate"), 1)).toBe(10);
    expect(diagonalCost(ruled("exact"), 0)).toBeCloseTo(7.07, 2);
  });

  test("the rule comes from the manifest, with the default for a system that declares none", () => {
    expect(gridRuleOf(null)).toBe(DEFAULT_RULE);
    const metric: SystemManifest = {
      id: "m",
      name: "Metric",
      grid: { type: "square", cellSize: 1.5, unit: "m", diagonals: "alternate" },
    };
    expect(gridRuleOf(metric)).toEqual({ cellSize: 1.5, unit: "m", diagonals: "alternate" });
    const unsized: SystemManifest = {
      id: "u",
      name: "Unsized",
      grid: { type: "square", cellSize: null, unit: "ft", diagonals: "exact" },
    };
    expect(gridRuleOf(unsized).cellSize).toBe(5);
  });
});
