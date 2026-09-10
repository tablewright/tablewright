import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TOOL,
  POINT_GAP,
  beginGesture,
  describeStroke,
  edgeNear,
  lineEdges,
  lockLine,
  moveGesture,
  normRect,
  strokeOf,
  withInk,
  type DrawTool,
  type Gesture,
} from "../src/index.js";

const wall: DrawTool = { ...withInk(DEFAULT_TOOL, "wall"), shape: "line" };

describe("shapes from gestures", () => {
  test("a rect is the block between its corners, whichever way it was dragged", () => {
    expect(normRect({ col: 5, row: 6 }, { col: 2, row: 3 })).toEqual({
      col0: 2,
      row0: 3,
      col1: 5,
      row1: 6,
    });
  });

  test("a line snaps to vertices and locks to its longer axis", () => {
    expect(lockLine({ x: 2.4, y: 3.6 }, { x: 7.2, y: 4.9 })).toEqual([
      { x: 2, y: 4 },
      { x: 7, y: 4 },
    ]);
    expect(lockLine({ x: 2.4, y: 3.6 }, { x: 3.2, y: 8.9 })).toEqual([
      { x: 2, y: 4 },
      { x: 2, y: 9 },
    ]);
  });

  test("the edges along a line are the cells' south or east sides", () => {
    expect(lineEdges({ x: 2, y: 4 }, { x: 5, y: 4 })).toEqual([
      { col: 2, row: 3, side: "south" },
      { col: 3, row: 3, side: "south" },
      { col: 4, row: 3, side: "south" },
    ]);
    expect(lineEdges({ x: 10, y: 8 }, { x: 10, y: 4 })).toEqual([
      { col: 9, row: 4, side: "east" },
      { col: 9, row: 5, side: "east" },
      { col: 9, row: 6, side: "east" },
      { col: 9, row: 7, side: "east" },
    ]);
  });

  test("a click takes the nearest edge, and none when far from every edge", () => {
    expect(edgeNear({ x: 4.1, y: 6.5 })).toEqual({ col: 3, row: 6, side: "east" });
    expect(edgeNear({ x: 4.5, y: 6.92 })).toEqual({ col: 4, row: 6, side: "south" });
    expect(edgeNear({ x: 4.5, y: 6.5 })).toBeUndefined();
  });

  test("a brush keeps points a gap apart", () => {
    const gesture: Gesture = { kind: "brush", points: [{ x: 1, y: 1 }] };
    moveGesture(gesture, { x: 1 + POINT_GAP / 2, y: 1 });
    expect(gesture.points).toHaveLength(1);
    moveGesture(gesture, { x: 1 + POINT_GAP * 2, y: 1 });
    expect(gesture.points).toHaveLength(2);
  });
});

describe("strokes from gestures", () => {
  test("a wall line becomes the wall along its edges", () => {
    const gesture = beginGesture(wall, { x: 10.1, y: 3.9 });
    expect(gesture?.kind).toBe("line");
    if (gesture === undefined) {
      return;
    }
    moveGesture(gesture, { x: 9.8, y: 8.2 });
    expect(strokeOf(wall, gesture)).toEqual({
      ink: "wall",
      shape: {
        kind: "line",
        edges: [
          { col: 9, row: 4, side: "east" },
          { col: 9, row: 5, side: "east" },
          { col: 9, row: 6, side: "east" },
          { col: 9, row: 7, side: "east" },
        ],
      },
      visibility: "party",
    });
  });

  test("a line that went nowhere leaves nothing", () => {
    expect(
      strokeOf(wall, { kind: "line", a: { x: 2.1, y: 2.1 }, b: { x: 2.2, y: 2.3 } })
    ).toBeUndefined();
  });

  test("a free shape needs three corners", () => {
    const two: Gesture = {
      kind: "free",
      points: [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
      ],
    };
    expect(strokeOf(DEFAULT_TOOL, two)).toBeUndefined();
    const three: Gesture = { kind: "free", points: [...two.points, { x: 2, y: 3 }] };
    expect(strokeOf(DEFAULT_TOOL, three)?.ink).toBe("ground");
  });

  test("a click with the threshold ink is the chosen threshold on that edge", () => {
    const door = withInk(
      { ...DEFAULT_TOOL, threshold: { kind: "door", state: "locked", size: "small" } },
      "threshold"
    );
    expect(door.shape).toBe("click");
    const gesture = beginGesture(door, { x: 4.05, y: 6.5 });
    expect(gesture).toEqual({ kind: "click", edge: { col: 3, row: 6, side: "east" } });
    if (gesture === undefined) {
      return;
    }
    expect(strokeOf(door, gesture)).toEqual({
      ink: "threshold",
      edge: { col: 3, row: 6, side: "east" },
      kind: "door",
      state: "locked",
      size: "small",
      visibility: "party",
    });
    expect(beginGesture(door, { x: 4.5, y: 6.5 })).toBeUndefined();
  });

  test("an ink keeps its shape when the next ink takes it, else takes that ink's first", () => {
    const rectGround = { ...DEFAULT_TOOL, shape: "rect" as const };
    expect(withInk(rectGround, "wall").shape).toBe("rect");
    expect(withInk(rectGround, "level-change").shape).toBe("brush");
    expect(withInk(rectGround, "threshold").shape).toBe("click");
  });

  test("the record describes a stroke in words", () => {
    const heights = withInk({ ...DEFAULT_TOOL, height: -10, shape: "rect" }, "height");
    const stroke = strokeOf(heights, {
      kind: "rect",
      a: { col: 1, row: 1 },
      b: { col: 3, row: 2 },
    });
    expect(stroke === undefined ? "" : describeStroke(stroke)).toBe("Height -10, 3 × 2 cells");
    const line = strokeOf(wall, { kind: "line", a: { x: 2, y: 4 }, b: { x: 3, y: 4 } });
    expect(line === undefined ? "" : describeStroke(line)).toBe("Wall along 1 edge");
  });
});
