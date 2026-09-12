import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RULE,
  catchesToken,
  caughtCells,
  clamped,
  derive,
  footprintCovers,
  holds,
  mansionStrokes,
  outline,
  placeOf,
  reached,
  snapOrigin,
  snapSize,
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

const rect = (over: Partial<Extract<Area, { kind: "rect" }>> = {}): Area => ({
  kind: "rect",
  aim: 90,
  length: 60,
  width: 5,
  height: 20,
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

  test("a spread of nought opens onto nothing, since a rectangle is its own tool", () => {
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

describe("a rectangle", () => {
  test("a box is a width across and a height rising from where it starts", () => {
    expect(holds(rect(), at(0, 0), at(30, 2.4, 19))).toBe(true);
    expect(holds(rect(), at(0, 0), at(30, 2.6, 19))).toBe(false);
    expect(holds(rect(), at(0, 0), at(30, 0, 21))).toBe(false);
    expect(holds(rect(), at(0, 0), at(61, 0, 1))).toBe(false);
  });

  test("its height is the effect's own, so a wall reaches what a bolt does not", () => {
    const wall = rect({ height: 20 });
    const bolt = rect({ height: 5 });
    const up = at(30, 0, 15);
    expect(holds(wall, at(0, 0), up)).toBe(true);
    expect(holds(bolt, at(0, 0), up)).toBe(false);
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

describe("what an area draws", () => {
  test("a rectangle is the four corners of its run", () => {
    // Aimed east, sixty feet long and ten wide: twelve cells by two.
    const ring = outline(rect({ width: 10 }), at(0, 0), rule).ring;
    const corners = [
      [0, -1],
      [12, -1],
      [12, 1],
      [0, 1],
    ];
    expect(ring).toHaveLength(4);
    corners.forEach(([x, y], index) => {
      expect(ring[index]?.x).toBeCloseTo(x ?? 0, 6);
      expect(ring[index]?.y).toBeCloseTo(y ?? 0, 6);
    });
  });

  test("a flat far edge reaches past the length at its corners", () => {
    const flat = outline(cone({ edge: "flat", spread: 60, length: 30 }), at(0, 0), rule).ring;
    expect(flat).toHaveLength(3);
    // Six cells along the axis, and the corners a seventh further out.
    const corner = flat[1] ?? { x: 0, y: 0 };
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(6 / Math.cos(Math.PI / 6), 6);
  });

  test("a round far edge keeps every point at the length", () => {
    const round = outline(cone({ edge: "round", spread: 60, length: 30 }), at(0, 0), rule).ring;
    expect(round.length).toBeGreaterThan(3);
    expect(round[0]).toEqual({ x: 0, y: 0 });
    for (const point of round.slice(1)) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(6, 6);
    }
  });

  test("a spread of nought draws nothing, as it holds nothing", () => {
    expect(outline(cone({ spread: 0 }), at(0, 0), rule).ring).toHaveLength(0);
  });

  test("a ring keeps the hole in its middle as a loop of its own", () => {
    const plain = outline(circle({ radius: 20, inner: 0 }), at(50, 50), rule);
    expect(plain.hole).toBeUndefined();
    const ring = outline(circle({ radius: 20, inner: 10 }), at(50, 50), rule);
    expect(ring.hole).toBeDefined();
    for (const point of ring.hole ?? []) {
      expect(Math.hypot(point.x - 10, point.y - 10)).toBeCloseTo(2, 6);
    }
  });
});

describe("reaching while it turns", () => {
  test("a size the pointer reached lands on whole cells, and never on none", () => {
    expect(snapSize(0, rule)).toBe(5);
    expect(snapSize(2, rule)).toBe(5);
    expect(snapSize(12, rule)).toBe(10);
    expect(snapSize(13, rule)).toBe(15);
    expect(snapSize(30, rule)).toBe(30);
  });

  test("a drag reaches a length, or a radius where that is the size", () => {
    const far = reached(cone({ length: 30 }), 45, rule);
    expect(far.kind === "cone" ? far.length : 0).toBe(45);
    const run = reached(rect({ length: 60 }), 20, rule);
    expect(run.kind === "rect" ? run.length : 0).toBe(20);
    // A circle sizes by its radius, so that is what the drag gives it.
    const wide = reached(circle({ radius: 20 }), 45, rule);
    expect(wide.kind === "circle" ? wide.radius : 0).toBe(45);
    // Dragged smaller, a ring's hole comes in with it rather than
    // swallowing the ring.
    const tight = reached(circle({ radius: 40, inner: 30 }), 15, rule);
    expect(tight.kind === "circle" ? tight.inner : -1).toBe(10);
  });
});

describe("where an area starts", () => {
  test("an origin sits in the middle of its own cube, or the cells nearest it are lost", () => {
    // Every cell is judged by the centre of its cube, half a cell up. An
    // origin left on the floor is therefore half a cell below everything
    // it is measured against, and the cell straight ahead falls outside a
    // 53° cone by a hair: 2.5 up over 5 along wants tan(half) of 0.5, and
    // 53° gives 0.4986.
    const ahead = at(5, 0, 2.5);
    expect(holds(cone({ aim: 90, spread: 53 }), at(0, 0, 0), ahead)).toBe(false);
    // Started from the middle of its own cube, it is dead on the axis.
    expect(holds(cone({ aim: 90, spread: 53 }), at(0, 0, 2.5), ahead)).toBe(true);
  });

  test("an origin snaps to a cell's middle, to a corner, or to neither", () => {
    const pressed = { x: 12, y: 18 };
    expect(snapOrigin(pressed, "centre", rule)).toEqual({ x: 12.5, y: 17.5 });
    expect(snapOrigin(pressed, "corner", rule)).toEqual({ x: 10, y: 20 });
    expect(snapOrigin(pressed, "free", rule)).toEqual(pressed);
  });

  test("from a cell's middle the cells straight ahead are caught, as a player expects", () => {
    const from = at(12.5, 17.5, 2.5);
    const east = cone({ aim: 90, spread: 53, length: 30 });
    const topology = derive([], bounds);
    const cells = caughtCells(east, from, topology, rule);
    const has = (col: number, row: number) =>
      cells.some((cell) => cell.col === col && cell.row === row);
    // The origin's own cell, and the three straight down the axis.
    expect(has(3, 3)).toBe(true);
    expect(has(4, 3)).toBe(true);
    expect(has(5, 3)).toBe(true);
  });
});

describe("taking hold of an area", () => {
  test("a press inside what is drawn takes hold of it, one outside does not", () => {
    const from = at(0, 0, 2.5);
    const east = cone({ aim: 90, spread: 60, length: 30 });
    // In cells: the origin is at nought and the cone runs six cells east.
    expect(footprintCovers(east, from, { x: 3, y: 0 }, rule)).toBe(true);
    expect(footprintCovers(east, from, { x: 3, y: 2.5 }, rule)).toBe(false);
    expect(footprintCovers(east, from, { x: -2, y: 0 }, rule)).toBe(false);
  });

  test("a ring is hollow to the hand as well as to the rules", () => {
    const from = at(50, 50, 2.5);
    const donut = circle({ radius: 20, inner: 10 });
    expect(footprintCovers(donut, from, { x: 10, y: 10 }, rule)).toBe(false);
    expect(footprintCovers(donut, from, { x: 13, y: 10 }, rule)).toBe(true);
    expect(footprintCovers(donut, from, { x: 20, y: 10 }, rule)).toBe(false);
  });
});

describe("a ring's hole stays inside it", () => {
  test("an inner radius is clamped under the radius, whichever number moved", () => {
    // Typed too wide: the hole comes back inside by a cell.
    const swallowed = clamped(circle({ radius: 20, inner: 20 }), rule);
    expect(swallowed.kind === "circle" ? swallowed.inner : -1).toBe(15);
    expect((clamped(circle({ radius: 20, inner: 40 }), rule) as { inner: number }).inner).toBe(15);
    // The radius pulled down under the hole drags the hole with it.
    const shrunk = clamped(circle({ radius: 10, inner: 15 }), rule);
    expect(shrunk.kind === "circle" ? shrunk.inner : -1).toBe(5);
    // A radius of one cell leaves no room for a hole at all.
    expect((clamped(circle({ radius: 5, inner: 5 }), rule) as { inner: number }).inner).toBe(0);
  });

  test("a ring left alone is left alone, and nothing else is touched", () => {
    const fine = circle({ radius: 20, inner: 10 });
    expect(clamped(fine, rule)).toBe(fine);
    const wall = rect({ length: 60, width: 5 });
    expect(clamped(wall, rule)).toBe(wall);
  });
});
