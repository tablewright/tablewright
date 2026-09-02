import { describe, expect, test } from "bun:test";
import { extentCovering, fitToRect, worldToScreen, type ZoomLimits } from "../src/index.js";

const limits: ZoomLimits = { min: 0.1, max: 8 };
const view = { width: 1000, height: 500 };

describe("fitToRect", () => {
  test("a wide rect fits the width and centres vertically", () => {
    const camera = fitToRect(view, { left: 0, top: 0, right: 2000, bottom: 500 }, limits);
    expect(camera.zoom).toBe(0.5);
    expect(worldToScreen(camera, { x: 0, y: 0 })).toEqual({ x: 0, y: 125 });
    expect(worldToScreen(camera, { x: 2000, y: 500 })).toEqual({ x: 1000, y: 375 });
  });

  test("a tall rect fits the height and centres horizontally", () => {
    const camera = fitToRect(view, { left: 0, top: 0, right: 250, bottom: 1000 }, limits);
    expect(camera.zoom).toBe(0.5);
    expect(worldToScreen(camera, { x: 0, y: 0 })).toEqual({ x: 437.5, y: 0 });
  });

  test("padding keeps a clear margin on the tight axis", () => {
    const camera = fitToRect(view, { left: 0, top: 0, right: 2000, bottom: 500 }, limits, 100);
    expect(camera.zoom).toBe(0.4);
    expect(worldToScreen(camera, { x: 0, y: 0 }).x).toBe(100);
  });

  test("a rect not at the origin is still centred", () => {
    const camera = fitToRect(view, { left: 300, top: 200, right: 800, bottom: 450 }, limits);
    expect(camera.zoom).toBe(2);
    expect(worldToScreen(camera, { x: 550, y: 325 })).toEqual({ x: 500, y: 250 });
  });

  test("zoom is clamped to the limits", () => {
    const camera = fitToRect(view, { left: 0, top: 0, right: 10, bottom: 10 }, limits);
    expect(camera.zoom).toBe(limits.max);
  });
});

describe("extentCovering", () => {
  test("rounds partial cells up so the whole image is covered", () => {
    const grid = { cellSize: 50, originX: 0, originY: 0 };
    expect(extentCovering(grid, 1000, 750)).toEqual({ colMin: 0, rowMin: 0, cols: 20, rows: 15 });
    expect(extentCovering(grid, 1001, 749)).toEqual({ colMin: 0, rowMin: 0, cols: 21, rows: 15 });
  });
});
