import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RULE,
  caughtCells,
  clamped,
  cubeCentre,
  derive,
  footprint,
  heightAt,
  holds,
  mansionStrokes,
  pointInPolygon,
  surface,
  tallest,
  type Area,
  type Point,
  type Spot,
} from "../src/index.js";

type Cone = Extract<Area, { kind: "cone" }>;

const rule = DEFAULT_RULE;
const at = (x: number, y: number, z = 0): Spot => ({ x, y, z });
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const origin = at(0, 0);

// Aimed east, so along the yaw is +x and across it is ±y, with up +z.
const cone = (over: Partial<Cone> = {}): Cone => ({
  kind: "cone",
  reaches: "around-corners",
  yaw: 90,
  pitch: 0,
  length: 30,
  spread: 53.13,
  edge: "round",
  form: "3d",
  height: 5,
  ...over,
});

const PITCHES = [-90, -75, -60, -35, -10, 0, 10, 35, 60, 75, 90];
const EDGES = ["round", "flat"] as const;

// Points of the plan about the origin out to `reach` every way, a hair off
// the whole numbers so that none sits exactly on an edge.
function planPoints(reach: number, step: number): Point[] {
  const points: Point[] = [];
  for (let x = -reach + 0.013; x <= reach; x += step) {
    for (let y = -reach + 0.029; y <= reach; y += step) {
      points.push({ x, y });
    }
  }
  return points;
}

// How far a cone reaches across the map at most: its length, or a flat
// edge's corners past it.
const reachOf = (area: Cone) =>
  area.edge === "flat" ? area.length / Math.cos(radians(area.spread / 2)) : area.length;

// The top of a level 3D cone as it was worked out before cones could tilt,
// kept as the answer a cone at pitch nought must still give.
function levelTop(area: Cone, plan: Point): number | undefined {
  const half = radians(area.spread / 2);
  const d = { x: Math.sin(radians(area.yaw)), y: -Math.cos(radians(area.yaw)) };
  const along = plan.x * d.x + plan.y * d.y;
  const across = Math.hypot(plan.x - along * d.x, plan.y - along * d.y);
  const wedge = along * Math.tan(half);
  const reach =
    area.edge === "round" ? area.length - Math.hypot(along, across) : area.length - along;
  if (Math.min(wedge - across, reach) <= 0) {
    return undefined;
  }
  const rise = wedge * wedge - across * across;
  const cap = area.length * area.length - along * along - across * across;
  return Math.sqrt(Math.max(area.edge === "round" ? Math.min(rise, cap) : rise, 0));
}

// The footprint of a level cone as it was drawn before cones could tilt.
function levelRing(area: Cone, from: Point, cells: number): Point[] {
  const toward = (degrees: number, reach: number): Point => ({
    x: from.x + Math.sin(radians(degrees)) * reach,
    y: from.y - Math.cos(radians(degrees)) * reach,
  });
  const length = area.length / cells;
  const half = area.spread / 2;
  if (area.edge === "flat") {
    const reach = length / Math.cos(radians(half));
    return [from, toward(area.yaw - half, reach), toward(area.yaw + half, reach)];
  }
  const ring: Point[] = [from];
  for (let turn = -half; turn < half; turn += 4) {
    ring.push(toward(area.yaw + turn, length));
  }
  ring.push(toward(area.yaw + half, length));
  return ring;
}

// The distance from a point to the nearest side of a ring.
function toRing(ring: readonly Point[], p: Point): number {
  let nearest = Infinity;
  ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length] ?? a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    nearest = Math.min(nearest, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  });
  return nearest;
}

// The area a ring encloses, by the shoelace.
function areaOf(ring: readonly Point[]): number {
  let twice = 0;
  ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length] ?? a;
    twice += a.x * b.y - b.x * a.y;
  });
  return Math.abs(twice) / 2;
}

describe("a cone that tilts", () => {
  test("pitched down it catches what lies under its axis, which the level cone misses", () => {
    // Fifteen feet out and twelve down: twenty feet along an axis pitched
    // down 35, and barely off it.
    const below = at(15, 0, -12);
    expect(holds(cone(), origin, below)).toBe(false);
    expect(holds(cone({ pitch: -35 }), origin, below)).toBe(true);
    expect(holds(cone({ pitch: 35 }), origin, below)).toBe(false);
    expect(holds(cone({ pitch: 35 }), origin, at(15, 0, 12))).toBe(true);
    // Straight down, what is under the origin is on the axis, whatever the yaw.
    expect(holds(cone({ pitch: -90 }), origin, at(0, 0, -20))).toBe(true);
    expect(holds(cone({ pitch: -90, yaw: 200 }), origin, at(0, 0, -20))).toBe(true);
    expect(holds(cone(), origin, at(0, 0, -20))).toBe(false);
  });

  test("its yaw turns it about the upright and its pitch tilts it from there", () => {
    // Facing north, up the map, and pitched down.
    const north = cone({ yaw: 0, pitch: -35 });
    expect(holds(north, origin, at(0, -15, -12))).toBe(true);
    expect(holds(north, origin, at(15, 0, -12))).toBe(false);
  });

  test("a flat cone stays level, and keeps its pitch for when it stands up again", () => {
    const level = cone({ form: "flat" });
    const pitched = cone({ form: "flat", pitch: -35 });
    for (const spot of [at(15, 0, 2), at(20, 5, 4), at(15, 0, -12), at(25, -9, 1)]) {
      expect(holds(pitched, origin, spot)).toBe(holds(level, origin, spot));
    }
    expect(footprint(pitched, at(50, 50), rule)).toEqual(footprint(level, at(50, 50), rule));
    expect(surface(pitched, origin, { x: 15, y: 0 })).toBeUndefined();
    expect(tallest(pitched)).toBe(0);
    expect(clamped(pitched, rule)).toBe(pitched);
  });

  test("a pitch past straight up or down is held to it, and one within is left as it is", () => {
    expect((clamped(cone({ pitch: -120 }), rule) as Cone).pitch).toBe(-90);
    expect((clamped(cone({ pitch: 400 }), rule) as Cone).pitch).toBe(90);
    const fine = cone({ pitch: -35 });
    expect(clamped(fine, rule)).toBe(fine);
  });
});

describe("the top of a cone that tilts", () => {
  test("agrees with the volume: just under it is held, just over it is not, and where there is none nothing is", () => {
    for (const pitch of PITCHES) {
      for (const edge of EDGES) {
        for (const spread of [53.13, 90]) {
          const area = cone({ pitch, edge, spread });
          const strays: string[] = [];
          let tops = 0;
          for (const p of planPoints(reachOf(area) + 1, 2.3)) {
            const top = surface(area, origin, p);
            if (top === undefined) {
              for (let z = -reachOf(area) - 1; z <= reachOf(area) + 1; z += 1.1) {
                if (holds(area, origin, at(p.x, p.y, z))) {
                  strays.push(`held with no top at ${p.x}, ${p.y}, ${z}`);
                }
              }
              continue;
            }
            tops += 1;
            if (!holds(area, origin, at(p.x, p.y, top - 1e-6))) {
              strays.push(`not held under the top at ${p.x}, ${p.y}, ${top}`);
            }
            if (holds(area, origin, at(p.x, p.y, top + 1e-6))) {
              strays.push(`held over the top at ${p.x}, ${p.y}, ${top}`);
            }
          }
          expect({ pitch, edge, spread, strays }).toEqual({ pitch, edge, spread, strays: [] });
          expect(tops).toBeGreaterThan(20);
        }
      }
    }
  });

  test("level, it is the top it always was", () => {
    for (const edge of EDGES) {
      for (const spread of [20, 53.13, 90]) {
        for (const yaw of [0, 90, 200]) {
          const area = cone({ yaw, edge, spread });
          const strays = planPoints(reachOf(area) + 1, 0.9).filter((p) => {
            const now = surface(area, origin, p);
            const then = levelTop(area, p);
            return now === undefined || then === undefined
              ? now !== then
              : Math.abs(now - then) > 1e-9;
          });
          expect(strays).toEqual([]);
        }
      }
    }
  });

  test("tilted down it is lower than the origin, and tilted up it is higher", () => {
    // Twenty feet along the axis the top is the axis's own height there
    // plus the wedge's radius over the cosine of the pitch, as the slanted
    // circle reads straight up.
    const down = surface(cone({ pitch: -35 }), origin, { x: 20 * Math.cos(radians(35)), y: 0 });
    const up = surface(cone({ pitch: 35 }), origin, { x: 20 * Math.cos(radians(35)), y: 0 });
    expect(down).toBeLessThan(0);
    expect(up).toBeGreaterThan(20 * Math.sin(radians(35)));
  });
});

describe("the highest point of a cone that tilts", () => {
  const half = 53.13 / 2;

  test("turns up with it, no further than straight up, and never sits below the apex", () => {
    // A round edge reaches the length along the axis turned up by the half
    // spread; a flat one the top of its far disc.
    expect(tallest(cone({ pitch: 30 }))).toBeCloseTo(30 * Math.sin(radians(30 + half)), 9);
    expect(tallest(cone({ pitch: 80 }))).toBeCloseTo(30, 9);
    expect(tallest(cone({ pitch: -60 }))).toBe(0);
    expect(tallest(cone({ pitch: 20, edge: "flat" }))).toBeCloseTo(
      (30 * Math.sin(radians(20 + half))) / Math.cos(radians(half)),
      9
    );
    expect(tallest(cone({ pitch: 90, edge: "flat" }))).toBeCloseTo(30, 9);
    expect(tallest(cone({ pitch: -60, edge: "flat" }))).toBe(0);
    // Level, it is what it was.
    expect(tallest(cone())).toBeCloseTo(30 * Math.sin(radians(half)), 9);
    expect(tallest(cone({ edge: "flat" }))).toBeCloseTo(30 * Math.tan(radians(half)), 9);
  });

  test("no top over the plan stands above it, and the tops come up to it", () => {
    for (const pitch of PITCHES) {
      for (const edge of EDGES) {
        const area = cone({ pitch, edge });
        let highest = -Infinity;
        for (const p of planPoints(reachOf(area), 0.25)) {
          highest = Math.max(highest, surface(area, origin, p) ?? -Infinity);
        }
        expect(highest).toBeLessThanOrEqual(tallest(area) + 1e-9);
        expect(highest).toBeGreaterThan(tallest(area) - 1.5);
      }
    }
  });
});

describe("the footprint of a cone that tilts", () => {
  // Off the map's nought, so every point in cells is positive.
  const from = at(50, 50, 20);
  const fromCells = { x: 10, y: 10 };

  test("holds every point of the volume seen from above, and only what the volume covers", () => {
    for (const pitch of PITCHES) {
      for (const edge of EDGES) {
        for (const spread of [20, 53.13, 90]) {
          const area = cone({ pitch, edge, spread });
          const { ring } = footprint(area, from, rule);
          const reach = reachOf(area) + 1;
          const strays: string[] = [];
          for (let x = -reach; x <= reach; x += 2.7) {
            for (let y = -reach; y <= reach; y += 2.7) {
              for (let z = -reach; z <= reach; z += 2.7) {
                if (!holds(area, from, at(from.x + x, from.y + y, from.z + z))) {
                  continue;
                }
                // The arcs are walked at four degrees, so the ring lies
                // inside the true curve by under a hundredth of a cell.
                const plan = { x: (from.x + x) / 5, y: (from.y + y) / 5 };
                if (!pointInPolygon(plan, ring) && toRing(ring, plan) > 0.01) {
                  strays.push(`${x}, ${y}, ${z}`);
                }
              }
            }
          }
          // Each corner of the ring, drawn in a hair toward its middle, has
          // the solid over it.
          const middle = ring.reduce(
            (sum, point) => ({
              x: sum.x + point.x / ring.length,
              y: sum.y + point.y / ring.length,
            }),
            { x: 0, y: 0 }
          );
          for (const point of ring) {
            const inside = {
              x: point.x + (middle.x - point.x) * 0.02,
              y: point.y + (middle.y - point.y) * 0.02,
            };
            if (surface(area, from, { x: inside.x * 5, y: inside.y * 5 }) === undefined) {
              strays.push(`nothing over the ring at ${point.x}, ${point.y}`);
            }
          }
          expect({ pitch, edge, spread, strays }).toEqual({ pitch, edge, spread, strays: [] });
        }
      }
    }
  });

  test("level, it is the wedge it always was, and a hair of pitch moves it no more than a hair", () => {
    for (const edge of EDGES) {
      for (const spread of [20, 53.13, 90]) {
        const level = cone({ edge, spread, yaw: 30 });
        const ring = footprint(level, from, rule).ring;
        expect(ring).toEqual(levelRing(level, fromCells, 5));
        const tilted = footprint({ ...level, pitch: 0.01 }, from, rule).ring;
        expect(areaOf(tilted) / areaOf(ring)).toBeCloseTo(1, 2);
        for (const point of tilted) {
          expect(toRing(ring, point)).toBeLessThan(0.02);
        }
      }
    }
  });

  test("straight down it is round about the origin, which sits inside it", () => {
    const { ring } = footprint(cone({ pitch: -90 }), from, rule);
    expect(pointInPolygon(fromCells, ring)).toBe(true);
    // The rim of a 53° cone thirty feet long, straight down: the length
    // times the sine of the half spread, in cells.
    for (const point of ring) {
      expect(Math.hypot(point.x - 10, point.y - 10)).toBeCloseTo(
        (30 * Math.sin(radians(26.565))) / 5,
        3
      );
    }
  });
});

describe("a breath from on high", () => {
  // A token thirty feet up over the west wing's floor at cell (4, 10),
  // breathing north toward the dais: the origin is the middle of its
  // cube, as the table makes it.
  const house = derive(mansionStrokes(), { colMin: 0, rowMin: 0, cols: 20, rows: 15 });
  const cell = { col: 4, row: 10 };
  const high = cubeCentre(cell, heightAt(house, cell) + 30, rule);
  const breath = (pitch: number) =>
    caughtCells(
      cone({ yaw: 0, pitch, length: 60, spread: 53, reaches: "line-of-sight" }),
      high,
      house,
      rule
    );
  const has = (cells: readonly { col: number; row: number }[], col: number, row: number) =>
    cells.some((one) => one.col === col && one.row === row);
  const onFloor = (cells: readonly { col: number; row: number }[]) =>
    cells.filter((one) => heightAt(house, one) === 0);

  test("pitched down 35 lights the floor where it lands, which the same cone level does not", () => {
    expect(high.z).toBe(32.5);
    const level = breath(0);
    const pitched = breath(-35);
    expect(onFloor(level)).toEqual([]);
    expect(onFloor(pitched).length).toBeGreaterThan(20);
    // Where it lands, twenty to thirty-five feet north on the axis.
    for (const row of [3, 4, 5, 6]) {
      expect(has(pitched, 4, row)).toBe(true);
      expect(has(level, 4, row)).toBe(false);
    }
    // Not under the token, which it passes over.
    expect(has(pitched, 4, 9)).toBe(false);
    expect(has(pitched, 4, 8)).toBe(false);
  });
});
