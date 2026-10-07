import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RULE,
  catchesToken,
  caughtCells,
  clamped,
  cubeCentre,
  derive,
  footprint,
  heightAt,
  holds,
  isSolid,
  mansionStrokes,
  pointInPolygon,
  risesTo,
  surface,
  tallest,
  type Area,
  type Cell,
  type Point,
  type Spot,
} from "../src/index.js";

type Rect = Extract<Area, { kind: "rect" }>;

const rule = DEFAULT_RULE;
const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const at = (x: number, y: number, z = 0): Spot => ({ x, y, z });
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const origin = at(0, 0);

// Aimed east, so along the yaw is +x and across it is ±y, with up +z:
// thirty feet long, ten wide and fifteen about its line.
const beam = (over: Partial<Rect> = {}): Rect => ({
  kind: "rect",
  reaches: "around-corners",
  yaw: 90,
  pitch: 0,
  length: 30,
  width: 10,
  height: 15,
  form: "beam",
  ...over,
});

const PITCHES = [-90, -75, -60, -35, -10, 0, 10, 35, 60, 75, 90];
const YAWS = [0, 37, 200];

// The furthest any of a beam reaches from its origin, every way.
const reachOf = (area: Rect) => area.length + (area.width + area.height) / 2;

// Points of the plan about the origin out to `reach` every way, a hair off
// the whole numbers so that none sits exactly on a face.
function planPoints(reach: number, step: number): Point[] {
  const points: Point[] = [];
  for (let x = -reach + 0.013; x <= reach; x += step) {
    for (let y = -reach + 0.029; y <= reach; y += step) {
      points.push({ x, y });
    }
  }
  return points;
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

const has = (cells: readonly Cell[], col: number, row: number) =>
  cells.some((one) => one.col === col && one.row === row);

// A beam's three ways, worked from its yaw and pitch here rather than taken
// from the board: along its line, across it on the level, and up about it.
function waysOf(area: Rect): { along: Spot; across: Spot; up: Spot } {
  const yaw = radians(area.yaw);
  const tilt = radians(area.pitch);
  return {
    along: at(Math.cos(tilt) * Math.sin(yaw), -Math.cos(tilt) * Math.cos(yaw), Math.sin(tilt)),
    across: at(Math.cos(yaw), Math.sin(yaw), 0),
    up: at(-Math.sin(tilt) * Math.sin(yaw), Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt)),
  };
}

const dot = (a: Spot, b: Spot) => a.x * b.x + a.y * b.y + a.z * b.z;

// Whether an offset from the origin lies in a beam's tube: out along its
// line to the length, and inside the ellipse its width across and its
// height up make about the line.
function inTube(area: Rect, v: Spot): boolean {
  const { along, across, up } = waysOf(area);
  const run = dot(v, along);
  const side = (2 * dot(v, across)) / area.width;
  const rise = (2 * dot(v, up)) / area.height;
  return run >= 0 && run <= area.length && side * side + rise * rise <= 1;
}

describe("a beam", () => {
  test("level, its height stands about its line, where a wall's rises from the origin", () => {
    const level = beam();
    expect(holds(level, origin, at(20, 4.9, 7.4))).toBe(true);
    expect(holds(level, origin, at(20, 0, -7.4))).toBe(true);
    expect(holds(level, origin, at(20, 0, 7.6))).toBe(false);
    expect(holds(level, origin, at(20, 0, -7.6))).toBe(false);
    expect(holds(level, origin, at(20, 5.1, 0))).toBe(false);
    expect(holds(level, origin, at(30.1, 0, 0))).toBe(false);
    expect(holds(level, origin, at(-0.1, 0, 0))).toBe(false);
    const wall = beam({ form: "wall" });
    expect(holds(wall, origin, at(20, 0, 14.9))).toBe(true);
    expect(holds(wall, origin, at(20, 0, -7.4))).toBe(false);
    expect(holds(level, origin, at(20, 0, 14.9))).toBe(false);
  });

  test("pitched, it runs along its own line, its width and height square to that line", () => {
    const down = beam({ pitch: -30 });
    // Twenty feet along a line pitched down 30, and the way up from it,
    // which leans forward as the line tilts down.
    const onLine = at(20 * Math.cos(radians(30)), 0, -20 * Math.sin(radians(30)));
    const up = { x: Math.sin(radians(30)), z: Math.cos(radians(30)) };
    const off = (rise: number, side = 0) =>
      at(onLine.x + up.x * rise, side, onLine.z + up.z * rise);
    expect(holds(down, origin, onLine)).toBe(true);
    expect(holds(beam(), origin, onLine)).toBe(false);
    expect(holds(down, origin, off(7.4))).toBe(true);
    expect(holds(down, origin, off(-7.4))).toBe(true);
    expect(holds(down, origin, off(7.6))).toBe(false);
    expect(holds(down, origin, off(-7.6))).toBe(false);
    expect(holds(down, origin, off(0, 4.9))).toBe(true);
    expect(holds(down, origin, off(0, -5.1))).toBe(false);
    // Turned to face north, the same line runs up the map.
    expect(holds(beam({ yaw: 0, pitch: -30 }), origin, at(0, -onLine.x, onLine.z))).toBe(true);
    expect(holds(beam({ yaw: 0, pitch: -30 }), origin, onLine)).toBe(false);
    // Straight up, its height lies back along the yaw and its width across.
    const upright = beam({ pitch: 90 });
    expect(holds(upright, origin, at(0, 0, 29.9))).toBe(true);
    expect(holds(upright, origin, at(0, 0, -0.1))).toBe(false);
    expect(holds(upright, origin, at(-7.4, 4.9, 10))).toBe(true);
    expect(holds(upright, origin, at(-7.6, 0, 10))).toBe(false);
    expect(holds(upright, origin, at(0, 5.1, 10))).toBe(false);
  });

  test("a wall stays level and keeps its pitch for when it is a beam again, and only a beam is lit", () => {
    const wall = beam({ form: "wall" });
    const pitched = beam({ form: "wall", pitch: -35 });
    for (const spot of [at(15, 0, 2), at(20, 4, 14), at(15, 0, -12), at(25, -4, 1)]) {
      expect(holds(pitched, origin, spot)).toBe(holds(wall, origin, spot));
    }
    expect(footprint(pitched, at(50, 50), rule)).toEqual(footprint(wall, at(50, 50), rule));
    expect(surface(pitched, origin, { x: 15, y: 0 })).toBeUndefined();
    expect(tallest(pitched)).toBe(0);
    expect(isSolid(pitched)).toBe(false);
    expect(isSolid(beam())).toBe(true);
    expect(clamped(pitched, rule)).toBe(pitched);
  });

  test("a pitch past straight up or down is held to it, and one within is left as it is", () => {
    expect((clamped(beam({ pitch: -120 }), rule) as Rect).pitch).toBe(-90);
    expect((clamped(beam({ pitch: 400 }), rule) as Rect).pitch).toBe(90);
    const fine = beam({ pitch: -35 });
    expect(clamped(fine, rule)).toBe(fine);
  });
});

describe("the top of a beam", () => {
  test("is its tube's: just under it is in the tube, just over it is not, and where there is none no height is", () => {
    for (const pitch of PITCHES) {
      for (const yaw of YAWS) {
        const area = beam({ pitch, yaw });
        const reach = reachOf(area) + 1;
        const strays: string[] = [];
        let tops = 0;
        for (const p of planPoints(reach, 2.9)) {
          const top = surface(area, origin, p);
          if (top === undefined) {
            for (let z = -reach; z <= reach; z += 1.3) {
              if (inTube(area, at(p.x, p.y, z))) {
                strays.push(`in the tube with no top at ${p.x}, ${p.y}, ${z}`);
              }
            }
            continue;
          }
          tops += 1;
          if (!inTube(area, at(p.x, p.y, top - 1e-6))) {
            strays.push(`not in the tube under the top at ${p.x}, ${p.y}, ${top}`);
          }
          if (inTube(area, at(p.x, p.y, top + 1e-6))) {
            strays.push(`in the tube over the top at ${p.x}, ${p.y}, ${top}`);
          }
        }
        expect({ pitch, yaw, strays }).toEqual({ pitch, yaw, strays: [] });
        expect(tops).toBeGreaterThan(10);
      }
    }
  });

  test("lies inside the box it catches with, which reaches past it at the corners", () => {
    for (const pitch of PITCHES) {
      for (const yaw of YAWS) {
        const area = beam({ pitch, yaw });
        const strays = planPoints(reachOf(area) + 1, 2.9).filter((p) => {
          const top = surface(area, origin, p);
          return top !== undefined && !holds(area, origin, at(p.x, p.y, top - 1e-6));
        });
        expect({ pitch, yaw, strays }).toEqual({ pitch, yaw, strays: [] });
      }
    }
    // Near the level beam's corner the box catches seven feet up, where
    // the tube has fallen to a foot and a half.
    expect(holds(beam(), origin, at(20, 4.9, 7.4))).toBe(true);
    expect(surface(beam(), origin, { x: 20, y: 4.9 })).toBeCloseTo(
      7.5 * Math.sqrt(1 - 0.98 ** 2),
      9
    );
  });

  test("on its line it is the box's top, half the height above the line square to it", () => {
    const down = beam({ pitch: -15, length: 60 });
    const top = (x: number) => surface(down, origin, { x, y: 0 }) ?? NaN;
    expect(top(20)).toBeCloseTo(-20 * Math.tan(radians(15)) + 7.5 / Math.cos(radians(15)), 9);
    expect(top(25) - top(20)).toBeCloseTo(-5 * Math.tan(radians(15)), 9);
    expect(surface(beam(), origin, { x: 20, y: 0 })).toBe(7.5);
  });

  test("at its sides it falls round to the line's own height", () => {
    const edge = 4.99999;
    const down = beam({ pitch: -15, length: 60 });
    const line = -20 * Math.tan(radians(15));
    for (const side of [edge, -edge]) {
      expect(Math.abs((surface(down, origin, { x: 20, y: side }) ?? NaN) - line)).toBeLessThan(
        0.02
      );
      expect(Math.abs(surface(beam(), origin, { x: 20, y: side }) ?? NaN)).toBeLessThan(0.02);
    }
  });

  test("across a pitched beam it is curved and the same either side of the line, and level it is no longer flat", () => {
    const down = beam({ pitch: -15, length: 60 });
    const top = (side: number) => surface(down, origin, { x: 20, y: side }) ?? NaN;
    const round = (side: number) => 7.5 * Math.sqrt(1 - (side / 5) ** 2);
    for (const side of [0.5, 1.5, 2.5, 3.5, 4.5]) {
      expect(top(side)).toBeCloseTo(top(-side), 9);
      expect(top(side)).toBeCloseTo(
        -20 * Math.tan(radians(15)) + round(side) / Math.cos(radians(15)),
        9
      );
    }
    // Curved, not a ridge: halfway out it has fallen far less than halfway.
    expect(top(0) - top(2.5)).toBeLessThan((top(0) - top(4.5)) / 2);
    for (const yaw of [0, 90, 200]) {
      const level = beam({ yaw });
      for (const p of planPoints(reachOf(level), 1.7)) {
        const top = surface(level, origin, p);
        if (holds(level, origin, at(p.x, p.y, 0))) {
          const side = dot(at(p.x, p.y), waysOf(level).across);
          expect(top).toBeCloseTo(round(side), 9);
        } else {
          expect(top).toBeUndefined();
        }
      }
    }
  });
});

describe("the highest point of a beam", () => {
  test("is its highest corner: the far end's rise, if it rises, and half the height above it", () => {
    for (const pitch of PITCHES) {
      const area = beam({ pitch });
      const rise = Math.max(0, 30 * Math.sin(radians(pitch)));
      expect(tallest(area)).toBeCloseTo(rise + 7.5 * Math.cos(radians(pitch)), 9);
    }
    expect(tallest(beam())).toBe(7.5);
    expect(tallest(beam({ pitch: 90 }))).toBeCloseTo(30, 9);
    expect(tallest(beam({ pitch: -90 }))).toBeCloseTo(0, 9);
  });

  test("no top over the plan stands above it, and the tops come up to it", () => {
    for (const pitch of PITCHES) {
      for (const yaw of YAWS) {
        const area = beam({ pitch, yaw });
        let highest = -Infinity;
        for (const p of planPoints(reachOf(area), 0.35)) {
          highest = Math.max(highest, surface(area, origin, p) ?? -Infinity);
        }
        expect(highest).toBeLessThanOrEqual(tallest(area) + 1e-9);
        expect(highest).toBeGreaterThan(tallest(area) - 1);
      }
    }
  });
});

describe("the footprint of a beam", () => {
  // Off the map's nought, so every point in cells is positive.
  const from = at(60, 60, 20);

  test("holds every point of the box seen from above, turns only at the box's corners, and holds the tube", () => {
    for (const pitch of PITCHES) {
      for (const yaw of YAWS) {
        const area = beam({ pitch, yaw });
        const { ring } = footprint(area, from, rule);
        const reach = reachOf(area) + 1;
        const strays: string[] = [];
        const covers = (plan: Point) => pointInPolygon(plan, ring) || toRing(ring, plan) < 1e-9;
        for (let x = -reach; x <= reach; x += 2.3) {
          for (let y = -reach; y <= reach; y += 2.3) {
            for (let z = -reach; z <= reach; z += 2.3) {
              if (!holds(area, from, at(from.x + x, from.y + y, from.z + z))) {
                continue;
              }
              if (!covers({ x: (from.x + x) / 5, y: (from.y + y) / 5 })) {
                strays.push(`${x}, ${y}, ${z}`);
              }
            }
          }
        }
        // Each corner of the ring is the shadow of one of the box's, so it
        // covers no more than the box does.
        const { along, across, up } = waysOf(area);
        const corners: Point[] = [];
        for (const run of [0, area.length]) {
          for (const side of [-area.width / 2, area.width / 2]) {
            for (const rise of [-area.height / 2, area.height / 2]) {
              corners.push({
                x: (from.x + along.x * run + across.x * side + up.x * rise) / 5,
                y: (from.y + along.y * run + across.y * side + up.y * rise) / 5,
              });
            }
          }
        }
        for (const point of ring) {
          if (!corners.some((one) => Math.hypot(one.x - point.x, one.y - point.y) < 1e-9)) {
            strays.push(`a turn that is no corner at ${point.x}, ${point.y}`);
          }
        }
        // The tube drawn inside the box lies inside its footprint too.
        for (const p of planPoints(reach, 1.9)) {
          const plan = { x: (from.x + p.x) / 5, y: (from.y + p.y) / 5 };
          if (
            surface(area, from, { x: from.x + p.x, y: from.y + p.y }) !== undefined &&
            !covers(plan)
          ) {
            strays.push(`tube outside at ${p.x}, ${p.y}`);
          }
        }
        expect({ pitch, yaw, strays }).toEqual({ pitch, yaw, strays: [] });
      }
    }
  });

  test("level, it is the wall's own ring", () => {
    for (const yaw of [0, 37, 90, 200]) {
      const level = footprint(beam({ yaw }), from, rule).ring;
      const wall = footprint(beam({ yaw, form: "wall" }), from, rule).ring;
      expect(level).toHaveLength(4);
      for (const corner of wall) {
        expect(
          level.some((point) => Math.hypot(point.x - corner.x, point.y - corner.y) < 1e-9)
        ).toBe(true);
      }
    }
  });

  test("a tall beam tilted steeply is caught as far as it leans, past its length and its width", () => {
    // Pitched up 75 and a hundred feet about its line, its height leans
    // forty feet and more across the map, where ten feet of length and five
    // of width would not reach.
    const bare = derive([], bounds);
    const tall = beam({ pitch: 75, length: 10, width: 5, height: 100 });
    const from = at(12.5, 37.5, 2.5);
    const caught = caughtCells(tall, from, bare, rule);
    const every: Cell[] = [];
    for (let row = 0; row < bounds.rows; row += 1) {
      for (let col = 0; col < bounds.cols; col += 1) {
        if (holds(tall, from, cubeCentre({ col, row }, 0, rule))) {
          every.push({ col, row });
        }
      }
    }
    expect(caught).toEqual(every);
    const furthest = Math.max(...caught.map((cell) => (cell.col + 0.5) * 5 - from.x));
    expect(furthest).toBeGreaterThan(tall.length + tall.width + 5);
  });
});

describe("a beam that meets the ground", () => {
  // From the snapped point half a cell up at (11, 9) in the east wing,
  // aimed east and pitched down 30: it goes into the floor short of the
  // pit at (14, 9) and (15, 9), ten feet down, and its line comes out
  // again over the pit's floor.
  const house = derive(mansionStrokes(), bounds);
  const from = at(57.5, 47.5, 2.5);
  const bolt = (reaches: Area["reaches"]) =>
    beam({ pitch: -30, length: 100, width: 5, height: 5, reaches });
  const inPit = (cells: readonly Cell[]) => cells.filter((cell) => heightAt(house, cell) === -10);

  test("catches nothing in the pit set to line of sight, and what its volume holds there spreading", () => {
    const sight = caughtCells(bolt("line-of-sight"), from, house, rule);
    const spread = caughtCells(bolt("around-corners"), from, house, rule);
    expect(inPit(sight)).toEqual([]);
    expect(inPit(spread)).toEqual([
      { col: 14, row: 9 },
      { col: 15, row: 9 },
    ]);
    for (const cell of inPit(spread)) {
      expect(holds(bolt("around-corners"), from, cubeCentre(cell, -10, rule))).toBe(true);
    }
    // Under the floor between, neither catches the cell above it.
    expect(has(sight, 13, 9)).toBe(false);
    expect(has(spread, 13, 9)).toBe(false);
  });

  test("is drawn over the pit only spreading, and nowhere its top is under the floor", () => {
    const pit = { x: 72.5, y: 47.5 };
    expect(surface(bolt("line-of-sight"), from, pit)).toBeLessThan(0);
    expect(risesTo(bolt("line-of-sight"), from, pit, house, rule)).toBeUndefined();
    expect(risesTo(bolt("around-corners"), from, pit, house, rule)).toBeGreaterThan(-10);
    const underFloor = { x: 67.5, y: 47.5 };
    expect(risesTo(bolt("line-of-sight"), from, underFloor, house, rule)).toBeUndefined();
    expect(risesTo(bolt("around-corners"), from, underFloor, house, rule)).toBeUndefined();
  });
});

describe("a bolt from the dais", () => {
  // A token on the dais's front edge, ten feet up, loosing a beam a hundred
  // feet by five by five south down the west wing, pitched down 15. The
  // origin is the middle of its cube, as the table makes it.
  const house = derive(mansionStrokes(), bounds);
  const caster = { col: 4, row: 2 };
  const from = cubeCentre(caster, heightAt(house, caster), rule);
  const bolt = beam({
    yaw: 180,
    pitch: -15,
    length: 100,
    width: 5,
    height: 5,
    reaches: "line-of-sight",
  });
  const onFloor = (id: string, row: number) => ({
    id,
    label: id,
    cell: { col: 4, row },
    facing: 0,
    height: heightAt(house, { col: 4, row }),
  });

  test("passes over a token beneath its high end and catches one where it comes down", () => {
    expect(from.z).toBe(12.5);
    const beneath = onFloor("b", 4);
    const landing = onFloor("c", 9);
    expect(beneath.height).toBe(0);
    expect(catchesToken(bolt, from, beneath, house, rule)).toBe(false);
    expect(catchesToken(bolt, from, landing, house, rule)).toBe(true);
    // It passes over rather than being stopped: its underside there is
    // above the token's cube, and the level beam passes over both.
    const over = { x: 22.5, y: 22.5 };
    expect(holds(bolt, from, at(over.x, over.y, 2.5))).toBe(false);
    expect(holds(bolt, from, at(over.x, over.y, from.z - 10 * Math.tan(radians(15))))).toBe(true);
    expect(catchesToken({ ...bolt, pitch: 0 }, from, landing, house, rule)).toBe(false);
  });
});
