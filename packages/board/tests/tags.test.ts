import { describe, expect, test } from "bun:test";
import type { Stroke } from "@tablewright/schema";
import {
  contoursOf,
  derive,
  mansionStrokes,
  tagPlaces,
  terraceHillStrokes,
  type TagPlace,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
// The bands the board draws at: a step, five feet.
const BAND = 5;

const tagsOf = (strokes: Stroke[]): TagPlace[] => {
  const topology = derive(strokes, bounds);
  return tagPlaces(topology, contoursOf(topology, BAND), BAND);
};
const levels = (tags: readonly TagPlace[]) => tags.map((tag) => tag.level).sort((a, b) => a - b);
const tagAt = (tags: readonly TagPlace[], level: number) => tags.find((tag) => tag.level === level);

// The mansion with its dais raised to `height` instead of twenty-five.
const withDais = (height: number): Stroke[] =>
  mansionStrokes().map((stroke) =>
    stroke.ink === "ground" && stroke.height === 25 ? { ...stroke, height } : stroke
  );

describe("the Marked view's tags", () => {
  test("the mansion is tagged once a rise: the dais at +25, the pit at -10, the south row at +5", () => {
    const tags = tagsOf(mansionStrokes());
    expect(levels(tags)).toEqual([-10, 5, 25]);
    // On the dais's north edge, west of the stairs off it.
    const dais = tagAt(tags, 25)?.top;
    expect(dais?.x).toBeGreaterThanOrEqual(1);
    expect(dais?.x).toBeLessThan(9);
    expect(dais?.y).toBeCloseTo(1, 0);
    // Nothing on the stairs, whose slope runs part of the dais's lowest ring.
    expect(tags.some((tag) => tag.top.x >= 9 && tag.top.x <= 11 && tag.top.y < 3.5)).toBe(false);
    const pit = tagAt(tags, -10)?.top;
    expect(pit?.x).toBeGreaterThanOrEqual(14);
    expect(pit?.x).toBeLessThanOrEqual(16);
    const south = tagAt(tags, 5)?.top;
    expect(south?.y).toBeCloseTo(12, 0);
  });

  test("with the dais at ten feet it is tagged once at +10, where the taller one is", () => {
    const tags = tagsOf(withDais(10));
    expect(levels(tags)).toEqual([-10, 5, 10]);
    const low = tagAt(tags, 10)?.top;
    const high = tagAt(tagsOf(mansionStrokes()), 25)?.top;
    expect(Math.round(low?.x ?? NaN)).toBe(Math.round(high?.x ?? NaN));
    expect(Math.round(low?.y ?? NaN)).toBe(Math.round(high?.y ?? NaN));
  });

  test("each terrace of the hill is a rise of its own, tagged at its own level", () => {
    expect(levels(tagsOf(terraceHillStrokes()))).toEqual([5, 10, 15, 20]);
  });
});
