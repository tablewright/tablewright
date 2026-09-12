import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RULE,
  catchesToken,
  caughtCells,
  derive,
  holds,
  mansionStrokes,
  placeOf,
  type Area,
  type Spot,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const rule = DEFAULT_RULE;
const at = (x: number, y: number, z = 0): Spot => ({ x, y, z });

// Aimed east, so along the axis is +x and across it is ±y.
const cone = (over: Partial<Extract<Area, { kind: "cone" }>> = {}): Area => ({
  kind: "cone",
  aim: 90,
  length: 30,
  spread: 53.13,
  edge: "round",
  form: "3d",
  height: 5,
  ...over,
});

const circle = (over: Partial<Extract<Area, { kind: "circle" }>> = {}): Area => ({
  kind: "circle",
  radius: 20,
  inner: 0,
  form: "sphere",
  height: 20,
  ...over,
});

const line = (over: Partial<Extract<Area, { kind: "line" }>> = {}): Area => ({
  kind: "line",
  aim: 90,
  length: 60,
  width: 5,
  height: 20,
  form: "box",
  ...over,
});

describe("a cone", () => {
  test("opens as wide as its spread and no wider", () => {
    // Twenty feet along the axis, a 53.13° cone reaches ten feet across.
    expect(holds(cone(), at(0, 0), at(20, 9.9))).toBe(true);
    expect(holds(cone(), at(0, 0), at(20, 10.1))).toBe(false);
    // A wider spread takes the same place; a narrower one does not.
    expect(holds(cone({ spread: 90 }), at(0, 0), at(20, 19))).toBe(true);
    expect(holds(cone({ spread: 20 }), at(0, 0), at(20, 9.9))).toBe(false);
  });

  test("a round edge keeps everything inside the length, a flat one does not", () => {
    // The far corner of a flat-edged cone sits past the length, by design.
    const corner = at(30, 14.9);
    expect(holds(cone({ edge: "flat", form: "flat" }), at(0, 0), corner)).toBe(true);
    expect(holds(cone({ edge: "round", form: "flat" }), at(0, 0), corner)).toBe(false);
    // Straight down the axis both agree at the length.
    expect(holds(cone({ edge: "round", form: "flat" }), at(0, 0), at(29.9, 0))).toBe(true);
  });

  test("a spread of nought opens onto nothing, since a line is its own tool", () => {
    expect(holds(cone({ spread: 0 }), at(0, 0), at(10, 0))).toBe(false);
  });

  test("flat stands as tall as it is told and 3D rises as it spreads", () => {
    const overhead = at(20, 0, 9);
    // Flat at five feet tall leaves anything nine feet up alone.
    expect(holds(cone({ form: "flat", height: 5 }), at(0, 0), overhead)).toBe(false);
    // The same cone in three dimensions has risen ten feet by twenty out.
    expect(holds(cone({ form: "3d" }), at(0, 0), overhead)).toBe(true);
    expect(holds(cone({ form: "3d" }), at(0, 0), at(20, 0, 11))).toBe(false);
  });

  test("in three dimensions the rise counts against the spread, not beside it", () => {
    // Twenty feet out the cone allows ten from its axis, whichever way.
    // Eight across is inside and eight up is inside, but eight of each is
    // eleven and a third away, so the cone that holds either misses both.
    expect(holds(cone(), at(0, 0), at(20, 8))).toBe(true);
    expect(holds(cone(), at(0, 0), at(20, 0, 8))).toBe(true);
    expect(holds(cone(), at(0, 0), at(20, 8, 8))).toBe(false);
  });
});

describe("a circle", () => {
  test("a sphere reaches every way and a dome stops at the floor", () => {
    const below = at(0, 0, -10);
    const above = at(0, 0, 10);
    expect(holds(circle({ form: "sphere" }), at(0, 0), below)).toBe(true);
    expect(holds(circle({ form: "dome" }), at(0, 0), below)).toBe(false);
    expect(holds(circle({ form: "dome" }), at(0, 0), above)).toBe(true);
  });

  test("a cylinder is a column, so how high a thing stands decides it", () => {
    const column = circle({ form: "cylinder", radius: 20, height: 20 });
    expect(holds(column, at(0, 0), at(19, 0, 19))).toBe(true);
    expect(holds(column, at(0, 0), at(19, 0, 21))).toBe(false);
    expect(holds(column, at(0, 0), at(19, 0, -1))).toBe(false);
    // Far out and low: a sphere would have missed it, a column does not.
    expect(holds(circle({ radius: 20 }), at(0, 0), at(19, 0, 19))).toBe(false);
  });

  test("an inner radius makes a ring, and nought makes a full disc", () => {
    const ring = circle({ form: "cylinder", inner: 10 });
    expect(holds(ring, at(0, 0), at(5, 0, 1))).toBe(false);
    expect(holds(ring, at(0, 0), at(15, 0, 1))).toBe(true);
    expect(holds(circle({ form: "cylinder", inner: 0 }), at(0, 0), at(5, 0, 1))).toBe(true);
  });
});

describe("a line", () => {
  test("a box is a width across and a height rising from where it starts", () => {
    expect(holds(line(), at(0, 0), at(30, 2.4, 19))).toBe(true);
    expect(holds(line(), at(0, 0), at(30, 2.6, 19))).toBe(false);
    expect(holds(line(), at(0, 0), at(30, 0, 21))).toBe(false);
    expect(holds(line(), at(0, 0), at(61, 0, 1))).toBe(false);
  });

  test("its height is the effect's own, so a wall reaches what a bolt does not", () => {
    const wall = line({ height: 20 });
    const bolt = line({ height: 5 });
    const up = at(30, 0, 15);
    expect(holds(wall, at(0, 0), up)).toBe(true);
    expect(holds(bolt, at(0, 0), up)).toBe(false);
  });

  test("a beam is round in section about its axis", () => {
    const beam = line({ form: "beam", width: 10 });
    // Five feet is the radius, so the diagonal at four and four is inside
    // a box of the same width and outside the beam.
    expect(holds(beam, at(0, 0), at(30, 0, 4.9))).toBe(true);
    expect(holds(beam, at(0, 0), at(30, 4, 4))).toBe(false);
    expect(holds(line({ width: 10 }), at(0, 0), at(30, 4, 4))).toBe(true);
  });
});

describe("what an area catches", () => {
  const topology = derive(mansionStrokes(), bounds);

  test("a cell is caught when the volume holds the centre of its cube", () => {
    // The hall floor is at nought; a cube's centre sits half a cell up.
    const cells = caughtCells(
      circle({ radius: 10, form: "cylinder", height: 10 }),
      at(25, 30),
      topology,
      rule
    );
    expect(cells.length).toBeGreaterThan(0);
    expect(
      cells.every((cell) => Math.hypot((cell.col + 0.5) * 5 - 25, (cell.row + 0.5) * 5 - 30) <= 10)
    ).toBe(true);
  });

  test("only the cells it could reach are asked about, not the whole map", () => {
    const small = caughtCells(
      circle({ radius: 5, form: "cylinder", height: 10 }),
      at(25, 30),
      topology,
      rule
    );
    const large = caughtCells(
      circle({ radius: 25, form: "cylinder", height: 10 }),
      at(25, 30),
      topology,
      rule
    );
    expect(small.length).toBeLessThan(large.length);
    expect(large.length).toBeLessThan(bounds.cols * bounds.rows);
  });

  test("the dais at ten feet is reached by a cone once it has risen that far", () => {
    // From the hall, twenty-five feet south of the dais, aimed north.
    const from = at(22.5, 32.5, 0);
    const onDais = { id: "a", label: "A", cell: { col: 4, row: 1 }, facing: 0, height: 10 };
    const north = (over: Partial<Extract<Area, { kind: "cone" }>>) =>
      cone({ aim: 0, length: 40, ...over });
    expect(catchesToken(north({ spread: 70 }), from, onDais, rule)).toBe(true);
    expect(catchesToken(north({ spread: 20 }), from, onDais, rule)).toBe(false);
    // Flat at five feet tall never reaches it, however wide it opens.
    expect(catchesToken(north({ spread: 90, form: "flat", height: 5 }), from, onDais, rule)).toBe(
      false
    );
  });

  test("a token is judged where it stands, so a flier escapes what washes the ground", () => {
    const ground = { id: "b", label: "B", cell: { col: 5, row: 6 }, facing: 0, height: 0 };
    const flier = { ...ground, id: "c", elevation: 30 };
    const from = at(27.5, 32.5, 0);
    const blast = circle({ radius: 20, form: "dome" });
    expect(placeOf(ground)).toBe(0);
    expect(placeOf(flier)).toBe(30);
    expect(catchesToken(blast, from, ground, rule)).toBe(true);
    expect(catchesToken(blast, from, flier, rule)).toBe(false);
  });
});
