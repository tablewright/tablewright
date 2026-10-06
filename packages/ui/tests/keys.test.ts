import { describe, expect, test } from "bun:test";
import { answerKey, step } from "../src/components/spotlight/keys.js";
import type { KeyPlace, KeyPress } from "../src/components/spotlight/keys.js";

function press(key: string, shift = false): KeyPress {
  return { key, shift };
}

function at(count: number, selected: number, fromTile = false, fromShare = false): KeyPlace {
  return { count, selected, fromTile, fromShare };
}

describe("step", () => {
  test("moves one on and one back", () => {
    expect(step(1, 1, 5)).toBe(2);
    expect(step(1, -1, 5)).toBe(0);
  });

  test("wraps from the last to the first and from the first to the last", () => {
    expect(step(4, 1, 5)).toBe(0);
    expect(step(0, -1, 5)).toBe(4);
  });

  test("a single tile is its own neighbour either way", () => {
    expect(step(0, 1, 1)).toBe(0);
    expect(step(0, -1, 1)).toBe(0);
  });

  test("with no tiles the selection stays at the start", () => {
    expect(step(0, 1, 0)).toBe(0);
    expect(step(0, -1, 0)).toBe(0);
  });
});

describe("answerKey", () => {
  test("the arrows step the selection from the input, and take focus along from a tile", () => {
    expect(answerKey(press("ArrowDown"), at(5, 1))).toEqual({
      own: true,
      effect: "select",
      index: 2,
      focus: false,
    });
    expect(answerKey(press("ArrowUp"), at(5, 1, true))).toEqual({
      own: true,
      effect: "select",
      index: 0,
      focus: true,
    });
  });

  test("the arrows wrap at both ends", () => {
    expect(answerKey(press("ArrowDown"), at(5, 4))).toMatchObject({ effect: "select", index: 0 });
    expect(answerKey(press("ArrowUp"), at(5, 0))).toMatchObject({ effect: "select", index: 4 });
  });

  test("Home and End jump on a tile, and are left to the caret in the input", () => {
    expect(answerKey(press("Home"), at(5, 3, true))).toEqual({
      own: true,
      effect: "select",
      index: 0,
      focus: true,
    });
    expect(answerKey(press("End"), at(5, 3, true))).toEqual({
      own: true,
      effect: "select",
      index: 4,
      focus: true,
    });
    expect(answerKey(press("Home"), at(5, 3))).toEqual({ own: true, effect: "none" });
    expect(answerKey(press("End"), at(5, 3))).toEqual({ own: true, effect: "none" });
  });

  test("Tab from the input lands on the selected tile; elsewhere it is not the box's", () => {
    expect(answerKey(press("Tab"), at(5, 3))).toEqual({ own: false, effect: "focus" });
    expect(answerKey(press("Tab", true), at(5, 3))).toEqual({ own: false, effect: "none" });
    expect(answerKey(press("Tab"), at(5, 3, true))).toEqual({ own: false, effect: "none" });
    expect(answerKey(press("Tab"), at(0, 0))).toEqual({ own: false, effect: "none" });
  });

  test("Enter chooses and Escape closes, from the input or a tile", () => {
    expect(answerKey(press("Enter"), at(5, 3))).toEqual({ own: true, effect: "choose" });
    expect(answerKey(press("Enter"), at(5, 3, true))).toEqual({ own: true, effect: "choose" });
    expect(answerKey(press("Escape"), at(5, 3))).toEqual({ own: true, effect: "close" });
    expect(answerKey(press("Escape"), at(0, 0, true))).toEqual({ own: true, effect: "close" });
  });

  test("Space chooses on a tile and types in the input", () => {
    expect(answerKey(press(" "), at(5, 2, true))).toEqual({ own: true, effect: "choose" });
    expect(answerKey(press(" "), at(5, 2))).toEqual({ own: false, effect: "none" });
  });

  test("Enter and Space on a tile's Share button are left to the button; the arrows still step from it", () => {
    expect(answerKey(press("Enter"), at(5, 2, true, true))).toEqual({ own: true, effect: "none" });
    expect(answerKey(press(" "), at(5, 2, true, true))).toEqual({ own: true, effect: "none" });
    expect(answerKey(press("ArrowDown"), at(5, 2, true, true))).toEqual({
      own: true,
      effect: "select",
      index: 3,
      focus: true,
    });
    expect(answerKey(press("Escape"), at(5, 2, true, true))).toEqual({
      own: true,
      effect: "close",
    });
  });

  test("any other key is left to whoever has it", () => {
    expect(answerKey(press("f"), at(5, 2))).toEqual({ own: false, effect: "none" });
    expect(answerKey(press("f"), at(5, 2, true))).toEqual({ own: false, effect: "none" });
  });
});
