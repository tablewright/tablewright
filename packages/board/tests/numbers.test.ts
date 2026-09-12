import { describe, expect, test } from "bun:test";
import { STAIR, cellNumbers, derive, mansionStrokes, terraceHillStrokes } from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const whole = bounds;

const textAt = (numbers: ReturnType<typeof cellNumbers>, col: number, row: number) =>
  numbers.find((number) => number.cell.col === col && number.cell.row === row)?.text;

describe("the numbers view", () => {
  test("a scene with no heights prints nothing at all", () => {
    expect(cellNumbers(derive([], bounds), whole)).toHaveLength(0);
  });

  test("a cell prints the height the rules read there, with its sign", () => {
    const numbers = cellNumbers(derive(mansionStrokes(), bounds), whole);
    // The dais at +10, the pit at -10, the gallery at +5.
    expect(textAt(numbers, 4, 1)).toBe("+10");
    expect(textAt(numbers, 14, 9)).toBe("-10");
    expect(textAt(numbers, 12, 12)).toBe("+5");
  });

  test("ground level says nothing, so the numbers mark what is unusual", () => {
    const numbers = cellNumbers(derive(mansionStrokes(), bounds), whole);
    // The hall floor is at nought and prints no zero.
    expect(textAt(numbers, 4, 6)).toBeUndefined();
    expect(numbers.length).toBeLessThan(whole.cols * whole.rows);
  });

  test("a level change prints stair instead of the height it slopes through", () => {
    const numbers = cellNumbers(derive(mansionStrokes(), bounds), whole);
    // The stairs off the dais, where the level change was painted.
    expect(textAt(numbers, 9, 1)).toBe(STAIR);
    expect(textAt(numbers, 10, 2)).toBe(STAIR);
  });

  test("only the cells in view are read, so a wide map costs what is on screen", () => {
    const topology = derive(terraceHillStrokes(), bounds);
    const all = cellNumbers(topology, whole);
    const corner = cellNumbers(topology, { colMin: 0, rowMin: 0, cols: 4, rows: 4 });
    expect(corner.length).toBeLessThan(all.length);
    for (const number of corner) {
      expect(number.cell.col).toBeLessThan(4);
      expect(number.cell.row).toBeLessThan(4);
    }
  });

  test("the crown of the hill reads as the rules read it, not as the field curves", () => {
    const numbers = cellNumbers(derive(terraceHillStrokes(), bounds), whole);
    const crown = textAt(numbers, 10, 7);
    expect(crown).toBe("+20");
  });
});
