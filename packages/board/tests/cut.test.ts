import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RULE,
  clearance,
  clearanceAt,
  cutOf,
  derive,
  firstStop,
  footprint,
  mansionStrokes,
  risesTo,
  surface,
  type Area,
  type Spot,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const rule = DEFAULT_RULE;
const at = (x: number, y: number, z = 0): Spot => ({ x, y, z });
const house = derive(mansionStrokes(), bounds);
const bare = derive([], bounds);

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

// A solid, its clearance built, and where its top stands at a point.
function laid(area: Area, origin: Spot, topology = house) {
  const cleared = clearance(area, origin, footprint(area, origin, rule), topology, rule);
  return {
    cleared,
    rises: (x: number, y: number) => risesTo(area, origin, { x, y }, topology, cleared, rule),
  };
}

describe("a cone laid beside the dais", () => {
  // From the middle of the cube at cell (4, 7) in the west wing, aimed
  // north at the dais, whose lip is four and a half cells on.
  const origin = at(22.5, 37.5, 2.5);
  const north = laid(cone(), origin);

  test("climbs onto the dais where its top clears the lip, and is cut where it does not", () => {
    // Straight up the axis a foot past the lip the cone has risen nearly
    // twelve feet: clear over the lip, so it is drawn at its own height.
    const axis = north.rises(22.5, 14);
    expect(axis).toBeCloseTo(2.5 + 23.5 * Math.tan((26.565 * Math.PI) / 180), 1);
    // Seven feet across it still stands above the dais and clears the lip.
    expect(north.rises(29.5, 14)).toBeCloseTo(2.5 + Math.sqrt(11.75 ** 2 - 49), 1);
    // Ten feet across its top is under the dais's floor.
    expect(north.rises(32.5, 14)).toBeUndefined();
    // Thirty feet on and twelve across its top stands above the floor of
    // the dais but under what the lip asks of a line from the origin.
    expect(surface(cone(), origin, { x: 34.5, y: 7.5 })).toBeCloseTo(9, 3);
    expect(north.rises(34.5, 7.5)).toBeUndefined();
    // Set to spread, the same point is drawn: only the floor cuts it.
    const spread = laid(cone({ reaches: "around-corners" }), origin);
    expect(spread.rises(34.5, 7.5)).toBeCloseTo(11.5, 3);
    // Short of the lip it floats over the room's floor.
    expect(north.rises(22.5, 16)).toBeCloseTo(2.5 + 21.5 * Math.tan((26.565 * Math.PI) / 180), 1);
  });

  test("says what the straight line says: stopped under the clearance, clear above it", () => {
    for (const [x, y] of [
      [22.5, 14],
      [29.5, 14],
      [34.5, 7.5],
      [22.5, 7.5],
    ] as const) {
      const needed = clearanceAt(north.cleared, house.samples, { x: x / 5, y: y / 5 });
      const to = { x: x / 5, y: y / 5 };
      const from = { x: 4.5, y: 7.5, z: 2.5 };
      expect(firstStop(house, from, { ...to, z: needed - 0.3 })?.by).toBe("ground");
      expect(firstStop(house, from, { ...to, z: needed + 0.3 })).toBeUndefined();
    }
  });
});

describe("a cone breathed down the hall", () => {
  const origin = at(12.5, 62.5, 2.5);
  const down = (reaches: Area["reaches"]) =>
    laid(cone({ aim: 90, length: 90, spread: 53, reaches }), origin);

  test("is cut by the wall set to line of sight, and drawn through it spreading", () => {
    // The room beyond the hall's north wall, fifty feet along the axis.
    const beyond = [62.5, 57.5] as const;
    expect(down("line-of-sight").rises(...beyond)).toBeUndefined();
    expect(down("around-corners").rises(...beyond)).toBeCloseTo(
      2.5 + Math.sqrt((50 * Math.tan((26.5 * Math.PI) / 180)) ** 2 - 25),
      6
    );
    // The gallery five feet up, which the top clears with room to spare.
    expect(down("line-of-sight").rises(62.5, 62.5)).toBeCloseTo(
      2.5 + 50 * Math.tan((26.5 * Math.PI) / 180),
      6
    );
  });
});

describe("the clearance", () => {
  test("on open ground is the ground itself, so a top is drawn wherever it stands above nought", () => {
    const origin = at(50, 50, 2.5);
    const open = laid(sphere(), origin, bare);
    for (const [x, y] of [
      [10, 10],
      [12, 8],
      [8, 11],
    ] as const) {
      expect(clearanceAt(open.cleared, bare.samples, { x, y })).toBe(0);
    }
    expect(open.rises(50, 50)).toBeCloseTo(22.5, 6);
    expect(open.rises(62, 50)).toBeCloseTo(2.5 + 16, 6);
    expect(open.rises(71, 50)).toBeUndefined();
  });

  test("across the lip from the hall floor asks what the line from the origin asks", () => {
    // From the hall floor through the arch to a cell back from the lip: the
    // line clears at fifteen and is stopped at ten, and the exact answer is
    // where it grazes the lip.
    const origin = at(22.5, 62.5, 2.5);
    const cleared = clearance(
      sphere({ radius: 60 }),
      origin,
      footprint(sphere({ radius: 60 }), origin, rule),
      house,
      rule
    );
    const needed = clearanceAt(cleared, house.samples, { x: 4.5, y: 1.5 });
    expect(needed).toBeCloseTo(2.5 + 11 * (7.5 / 9.5), 0);
    const from = { x: 4.5, y: 12.5, z: 2.5 };
    expect(firstStop(house, from, { x: 4.5, y: 1.5, z: needed - 0.3 })?.by).toBe("ground");
    expect(firstStop(house, from, { x: 4.5, y: 1.5, z: needed + 0.3 })).toBeUndefined();
  });

  test("marks only what a wall cuts off, never the footprint's own edge", () => {
    // On open ground, a sample just inside the sphere's rim, every way
    // round, is never marked: the shader cuts the rim at each pixel.
    const origin = at(50, 50, 2.5);
    const open = laid(sphere(), origin, bare);
    for (let turn = 0; turn < 360; turn += 15) {
      const radians = (turn * Math.PI) / 180;
      const rim = { x: 10 + Math.sin(radians) * 3.98, y: 10 - Math.cos(radians) * 3.98 };
      expect(clearanceAt(open.cleared, bare.samples, rim)).not.toBe(Infinity);
    }
    // The room beyond the hall's north wall is still cut off from the
    // cone breathed down the hall.
    const down = laid(cone({ aim: 90, length: 90, spread: 53 }), at(12.5, 62.5, 2.5));
    expect(clearanceAt(down.cleared, house.samples, { x: 12.5, y: 11.5 })).toBe(Infinity);
  });

  test("is infinite past its box, where no solid is", () => {
    const origin = at(50, 50, 2.5);
    const open = laid(sphere(), origin, bare);
    expect(clearanceAt(open.cleared, bare.samples, { x: 0.5, y: 0.5 })).toBe(Infinity);
  });
});

describe("how an area is cut", () => {
  test("a flat form is cut by its ring and a solid by what it must clear", () => {
    const origin = at(12.5, 62.5, 2.5);
    const flat = cone({ aim: 90, form: "flat" });
    const ring = cutOf(flat, origin, footprint(flat, origin, rule), house, rule);
    expect(ring.kind).toBe("ring");
    const solid = cutOf(
      cone({ aim: 90 }),
      origin,
      footprint(cone({ aim: 90 }), origin, rule),
      house,
      rule
    );
    expect(solid.kind).toBe("solid");
    if (solid.kind === "solid") {
      expect(solid.clearance.values.length).toBe(
        solid.clearance.box.width * solid.clearance.box.height
      );
    }
  });
});
