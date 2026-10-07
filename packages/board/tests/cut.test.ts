import { describe, expect, test } from "bun:test";
import type { Stroke } from "@tablewright/schema";
import {
  DEFAULT_RULE,
  OPEN_EDGE,
  cutOf,
  derive,
  edgeTops,
  mansionStrokes,
  risesTo,
  surface,
  type Area,
  type EdgeTops,
  type Spot,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const rule = DEFAULT_RULE;
const at = (x: number, y: number, z = 0): Spot => ({ x, y, z });
const house = derive(mansionStrokes(), bounds);
const bare = derive([], bounds);
const tan = (degrees: number) => Math.tan((degrees * Math.PI) / 180);

const cone = (over: Partial<Extract<Area, { kind: "cone" }>> = {}): Area => ({
  kind: "cone",
  reaches: "line-of-sight",
  aim: 0,
  length: 40,
  spread: 53.13,
  edge: "round",
  form: "3d",
  height: 5,
  ...over,
});

const sphere = (over: Partial<Extract<Area, { kind: "circle" }>> = {}): Area => ({
  kind: "circle",
  reaches: "line-of-sight",
  radius: 20,
  inner: 0,
  form: "sphere",
  height: 20,
  ...over,
});

// Where a solid's top stands at a point, laid down in a scene.
const laid =
  (area: Area, origin: Spot, topology = house) =>
  (x: number, y: number) =>
    risesTo(area, origin, { x, y }, topology, rule);

describe("a cone laid beside the dais", () => {
  // From the middle of the cube at cell (4, 7) in the west wing, aimed
  // north at the dais, whose lip is four and a half cells on.
  const origin = at(22.5, 37.5, 2.5);
  const north = laid(cone(), origin);

  test("climbs onto the dais where a creature there is reached over the lip, and is cut where it is not", () => {
    // A foot past the lip, straight up the axis: the line from the origin
    // to creature height on the dais, twelve and a half up, climbs over
    // the lip, and the cone has risen nearly twelve feet, so it is drawn
    // at its own height.
    expect(north(22.5, 14)).toBeCloseTo(2.5 + 23.5 * tan(26.565), 1);
    // Seven feet across the same line climbs over, and the top still
    // stands above the dais.
    expect(north(29.5, 14)).toBeCloseTo(2.5 + Math.sqrt(11.75 ** 2 - 49), 1);
    // Ten feet across its top is under the dais's own floor.
    expect(north(32.5, 14)).toBeUndefined();
    // Far back on the dais the line to creature height grazes under the
    // lip, as it does for the squares there, so the solid is cut although
    // its top stands well above the dais.
    expect(surface(cone(), origin, { x: 22.5, y: 6 })).toBeCloseTo(31.5 * tan(26.565), 3);
    expect(north(22.5, 6)).toBeUndefined();
    // Set to spread, the same point is drawn: only the floor cuts it.
    expect(laid(cone({ reaches: "around-corners" }), origin)(22.5, 6)).toBeCloseTo(
      2.5 + 31.5 * tan(26.565),
      3
    );
    // Short of the lip it floats over the room's floor.
    expect(north(22.5, 16)).toBeCloseTo(2.5 + 21.5 * tan(26.565), 1);
  });
});

describe("a cone breathed down the hall", () => {
  const origin = at(12.5, 62.5, 2.5);
  const area = cone({ aim: 90, length: 90, spread: 53 });
  const down = (reaches: Area["reaches"]) => laid({ ...area, reaches }, origin);

  test("is cut everywhere beyond the north wall set to line of sight, and drawn through it spreading", () => {
    // Creature height in the room beyond is two and a half feet up, so
    // the line to it meets the ten-foot wall near the apex and far along
    // alike, however high the cone's top has risen by then.
    for (const beyond of [
      { x: 19.5, y: 59.75 },
      { x: 62.5, y: 57.5 },
    ]) {
      expect(surface(area, origin, beyond)).toBeGreaterThan(0);
      expect(down("line-of-sight")(beyond.x, beyond.y)).toBeUndefined();
      expect(down("around-corners")(beyond.x, beyond.y)).toBeCloseTo(
        2.5 + (surface(area, origin, beyond) ?? NaN),
        6
      );
    }
    // The gallery five feet up, whose creature height the line reaches.
    expect(down("line-of-sight")(62.5, 62.5)).toBeCloseTo(2.5 + 50 * tan(26.5), 6);
  });
});

describe("a sphere on open ground", () => {
  const origin = at(50, 50, 2.5);
  const open = laid(sphere(), origin, bare);

  test("is drawn wherever its top stands above the floor, out to its rim", () => {
    expect(open(50, 50)).toBeCloseTo(22.5, 6);
    expect(open(62, 50)).toBeCloseTo(2.5 + 16, 6);
    expect(open(71, 50)).toBeUndefined();
    // A hair inside the rim, every way round, the top is low and drawn.
    for (let turn = 0; turn < 360; turn += 15) {
      const radians = (turn * Math.PI) / 180;
      const rim = open(50 + Math.sin(radians) * 19.9, 50 - Math.cos(radians) * 19.9);
      expect(rim).toBeCloseTo(2.5 + Math.sqrt(400 - 19.9 ** 2), 6);
    }
  });
});

describe("how an area is cut", () => {
  test("a flat form is cut by its ring and a solid pixel by pixel", () => {
    const origin = at(12.5, 62.5, 2.5);
    const ring = cutOf(cone({ aim: 90, form: "flat" }), origin, house, rule);
    expect(ring.kind).toBe("ring");
    expect(cutOf(cone({ aim: 90 }), origin, house, rule).kind).toBe("solid");
    expect(cutOf(sphere(), origin, house, rule).kind).toBe("solid");
  });
});

describe("the solid edges laid out for the shader", () => {
  // The two tops at a cell's texel, the cell named as the bounds name it.
  const topsAt = (tops: EdgeTops, col: number, row: number): [number, number] => {
    const texel = ((row - bounds.rowMin + 1) * tops.cols + (col - bounds.colMin + 1)) * 2;
    return [tops.values[texel] ?? NaN, tops.values[texel + 1] ?? NaN];
  };

  test("hold a wall's and a shut door's top over the higher cell, and nothing for what sight passes", () => {
    const tops = edgeTops(house);
    expect(tops.cols).toBe(bounds.cols + 1);
    expect(tops.rows).toBe(bounds.rows + 1);
    // The west wing's north wall stands between the outside at nought and
    // the dais at ten, so its top is twenty.
    expect(topsAt(tops, 4, 0)[1]).toBe(20);
    // The hall's north wall over the gallery at five tops out at fifteen,
    // and the secret door in it is a wall until it is worked.
    expect(topsAt(tops, 12, 11)[1]).toBe(15);
    expect(topsAt(tops, 16, 11)[1]).toBe(15);
    // The locked door on the corridor stands ten from the floor.
    expect(topsAt(tops, 10, 3)[0]).toBe(10);
    // An arch, an open door and a window are open to the line.
    expect(topsAt(tops, 4, 11)[1]).toBe(OPEN_EDGE);
    expect(topsAt(tops, 8, 7)[0]).toBe(OPEN_EDGE);
    expect(topsAt(tops, 18, 2)[0]).toBe(OPEN_EDGE);
    // A cell with no edge of its own holds nothing either way.
    expect(topsAt(tops, 5, 5)).toEqual([OPEN_EDGE, OPEN_EDGE]);
  });

  test("keep a wall on the map's own west border, keyed to the cell outside it", () => {
    const border: Stroke = {
      ink: "wall",
      shape: { kind: "line", edges: [{ col: -1, row: 3, side: "east" }] },
      look: "data",
      visibility: "party",
    };
    const tops = edgeTops(derive([border], bounds));
    expect(topsAt(tops, -1, 3)[0]).toBe(10);
  });
});
