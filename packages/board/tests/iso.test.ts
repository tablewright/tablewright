import { describe, expect, test } from "bun:test";
import {
  contourGroups,
  derive,
  isoLines,
  mansionStrokes,
  terraceHillStrokes,
} from "../src/index.js";

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

describe("contours grouped by connection", () => {
  test("the mansion has two rises at 2.5 ft and one pit at -2.5 ft, each one ring", () => {
    const house = derive(mansionStrokes(), bounds);
    const groups = contourGroups(isoLines(house, 2.5));
    // The gallery and the raised south row, plus a speck the stair slope
    // leaves inside itself, a few samples across.
    const rises = groups.filter((group) => group.length >= 16);
    expect(rises.length).toBe(2);
    expect(groups.length - rises.length).toBe(1);
    expect(groups.find((group) => group.length < 16)?.length).toBeLessThan(8);
    expect(contourGroups(isoLines(house, -2.5)).length).toBe(1);
    // A ring is closed: every endpoint is shared by two segments.
    for (const ring of rises) {
      const ends = new Map<string, number>();
      for (const { from, to } of ring) {
        for (const point of [from, to]) {
          const key = `${Math.round(point.x * 4096)}:${Math.round(point.y * 4096)}`;
          ends.set(key, (ends.get(key) ?? 0) + 1);
        }
      }
      expect([...ends.values()].every((count) => count === 2)).toBe(true);
    }
  });

  test("the hill's outer ring is one contour", () => {
    expect(contourGroups(isoLines(derive(terraceHillStrokes(), bounds), 2.5)).length).toBe(1);
  });
});
