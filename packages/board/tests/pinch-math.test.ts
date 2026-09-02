import { describe, expect, test } from "bun:test";
import { pinchStep, type Point } from "../src/index.js";

const pair = (a: Point, b: Point): readonly [Point, Point] => [a, b];

describe("pinchStep", () => {
  test("fingers spreading symmetrically zoom about a still midpoint", () => {
    const step = pinchStep(
      pair({ x: 100, y: 100 }, { x: 200, y: 100 }),
      pair({ x: 50, y: 100 }, { x: 250, y: 100 })
    );
    expect(step.factor).toBe(2);
    expect(step.anchor).toEqual({ x: 150, y: 100 });
    expect([step.dx, step.dy]).toEqual([0, 0]);
  });

  test("fingers moving together pan without zooming", () => {
    const step = pinchStep(
      pair({ x: 100, y: 100 }, { x: 200, y: 100 }),
      pair({ x: 130, y: 90 }, { x: 230, y: 90 })
    );
    expect(step.factor).toBe(1);
    expect([step.dx, step.dy]).toEqual([30, -10]);
    expect(step.anchor).toEqual({ x: 180, y: 90 });
  });

  test("closing fingers zoom out by the separation ratio", () => {
    const step = pinchStep(
      pair({ x: 0, y: 0 }, { x: 0, y: 400 }),
      pair({ x: 0, y: 100 }, { x: 0, y: 300 })
    );
    expect(step.factor).toBe(0.5);
  });

  test("two pointers on one spot are a pure pan", () => {
    const step = pinchStep(
      pair({ x: 10, y: 10 }, { x: 10, y: 10 }),
      pair({ x: 20, y: 10 }, { x: 40, y: 10 })
    );
    expect(step.factor).toBe(1);
    expect(step.dx).toBe(20);
  });
});
