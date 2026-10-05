import { describe, expect, test } from "bun:test";
import type { Edge, ThresholdPlay } from "@tablewright/schema";
import { derive, edgeAt, mansionStrokes, worked } from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const SHUT_DOOR: Edge = { col: 15, row: 6, side: "south" };
const LOCKED_DOOR: Edge = { col: 10, row: 3, side: "east" };
const SECRET_DOOR: Edge = { col: 16, row: 11, side: "south" };
const LARGE_WINDOW: Edge = { col: 18, row: 2, side: "east" };
const SMALL_WINDOW: Edge = { col: 0, row: 6, side: "east" };

// What a tap on `edge` comes to in the mansion, after what `play` already did.
function tap(edge: Edge, play: ThresholdPlay[] = []) {
  const data = edgeAt(derive(mansionStrokes(), bounds, play), edge);
  if (data?.kind !== "threshold") {
    throw new Error("no threshold on that edge of the mansion");
  }
  return worked(data);
}

describe("working a threshold in play", () => {
  test("a shut door opens, and an open one shuts", () => {
    expect(tap(SHUT_DOOR)).toEqual({ state: "open" });
    expect(tap(SHUT_DOOR, [{ edge: SHUT_DOOR, state: "open" }])).toEqual({ state: "closed" });
  });

  test("a locked door stays locked, and says why instead", () => {
    const outcome = tap(LOCKED_DOOR);
    expect(outcome).not.toHaveProperty("state");
    expect(outcome).toHaveProperty("notice");
  });

  test("a secret door worked is revealed, shut", () => {
    expect(tap(SECRET_DOOR)).toEqual({ state: "closed" });
  });

  test("a large window is smashed through, once", () => {
    expect(tap(LARGE_WINDOW)).toEqual({ state: "smashed" });
    const again = tap(LARGE_WINDOW, [{ edge: LARGE_WINDOW, state: "smashed" }]);
    expect(again).not.toHaveProperty("state");
    expect(again).toHaveProperty("notice");
  });

  test("a small window stays as it is: sight only", () => {
    const outcome = tap(SMALL_WINDOW);
    expect(outcome).not.toHaveProperty("state");
    expect(outcome).toHaveProperty("notice");
  });
});
