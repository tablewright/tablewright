import { describe, expect, test } from "bun:test";
import { wheelDeltaToPixels, wheelZoomFactor } from "../src/index.js";

describe("wheelDeltaToPixels", () => {
  test("passes pixel deltas through unchanged", () => {
    expect(wheelDeltaToPixels(37, 0, 900)).toBe(37);
  });

  test("scales line deltas by a text row", () => {
    expect(wheelDeltaToPixels(3, 1, 900)).toBe(48);
  });

  test("scales page deltas by the viewport extent", () => {
    expect(wheelDeltaToPixels(-1, 2, 900)).toBe(-900);
  });
});

describe("wheelZoomFactor", () => {
  test("a notch up zooms in by the step, a notch down zooms out by the inverse", () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.1, 10);
    expect(wheelZoomFactor(100)).toBeCloseTo(1 / 1.1, 10);
  });

  test("no delta means no change", () => {
    expect(wheelZoomFactor(0)).toBe(1);
  });

  test("opposite deltas cancel exactly", () => {
    expect(wheelZoomFactor(37) * wheelZoomFactor(-37)).toBeCloseTo(1, 10);
  });
});
