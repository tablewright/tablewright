import { describe, expect, test } from "bun:test";
import {
  facingBetween,
  facingToRadians,
  facingToward,
  normalizeDegrees,
  ringArc,
} from "../src/index.js";

describe("normalizeDegrees", () => {
  test("wraps into the compass range from either side", () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(360)).toBe(0);
  });
});

describe("facingToward", () => {
  test("points from a world position toward another as a compass heading", () => {
    const centre = { x: 100, y: 100 };
    expect(facingToward(centre, { x: 100, y: 0 })).toBe(0);
    expect(facingToward(centre, { x: 200, y: 200 })).toBe(135);
    expect(facingToward(centre, { x: 0, y: 100 })).toBe(270);
  });

  test("the same point has no direction", () => {
    expect(facingToward({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(undefined);
  });
});

describe("facingBetween", () => {
  test("the four cardinal steps read as compass headings", () => {
    const origin = { col: 5, row: 5 };
    expect(facingBetween(origin, { col: 5, row: 4 })).toBe(0);
    expect(facingBetween(origin, { col: 6, row: 5 })).toBe(90);
    expect(facingBetween(origin, { col: 5, row: 6 })).toBe(180);
    expect(facingBetween(origin, { col: 4, row: 5 })).toBe(270);
  });

  test("a diagonal move faces the diagonal", () => {
    expect(facingBetween({ col: 0, row: 0 }, { col: 3, row: -3 })).toBe(45);
    expect(facingBetween({ col: 0, row: 0 }, { col: -2, row: 2 })).toBe(225);
  });

  test("staying put has no facing to report", () => {
    expect(facingBetween({ col: 2, row: 2 }, { col: 2, row: 2 })).toBe(undefined);
  });
});

describe("facingToRadians", () => {
  test("north is straight up in screen space and east is zero", () => {
    expect(facingToRadians(0)).toBeCloseTo(-Math.PI / 2, 10);
    expect(facingToRadians(90)).toBeCloseTo(0, 10);
  });
});

describe("ringArc", () => {
  test("the gap is centred on the rear and the arc covers the rest", () => {
    const arc = ringArc(0, 90);
    expect(arc.end - arc.start).toBeCloseTo((270 * Math.PI) / 180, 10);
    const rear = facingToRadians(180);
    expect(arc.start).toBeCloseTo(rear + Math.PI / 4, 10);
    expect(arc.end).toBeCloseTo(rear + 2 * Math.PI - Math.PI / 4, 10);
  });
});
