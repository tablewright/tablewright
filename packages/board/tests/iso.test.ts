import { describe, expect, test } from "bun:test";
import { derive, isoLines, mansionStrokes, terraceHillStrokes } from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };

describe("iso-lines over the field", () => {
  test("a flat field has no contour", () => {
    expect(isoLines(derive([], bounds), 2.5)).toEqual([]);
  });

  test("the mansion's raised gallery is ringed at 7.5 ft, and nothing else is", () => {
    const segments = isoLines(derive(mansionStrokes(), bounds), 7.5);
    expect(segments.length).toBeGreaterThan(0);
    for (const { from, to } of segments) {
      for (const point of [from, to]) {
        expect(point.x).toBeGreaterThanOrEqual(0.5);
        expect(point.x).toBeLessThanOrEqual(9.5);
        expect(point.y).toBeGreaterThanOrEqual(0.5);
        expect(point.y).toBeLessThanOrEqual(3.5);
      }
    }
  });

  test("the pit shows below ground level", () => {
    const segments = isoLines(derive(mansionStrokes(), bounds), -2.5);
    expect(segments.length).toBeGreaterThan(0);
    for (const { from, to } of segments) {
      for (const point of [from, to]) {
        expect(point.x).toBeGreaterThanOrEqual(13.5);
        expect(point.x).toBeLessThanOrEqual(16.5);
        expect(point.y).toBeGreaterThanOrEqual(8.5);
        expect(point.y).toBeLessThanOrEqual(11.5);
      }
    }
  });

  test("the hill's rings follow its wobble and stay on the map", () => {
    const segments = isoLines(derive(terraceHillStrokes(), bounds), 7.5);
    expect(segments.length).toBeGreaterThan(50);
    for (const { from, to } of segments) {
      for (const point of [from, to]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(bounds.cols);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(bounds.rows);
      }
      expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeLessThanOrEqual(Math.SQRT2 / 8 + 1e-9);
    }
  });
});
