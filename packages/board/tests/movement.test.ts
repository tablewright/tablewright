import { describe, expect, test } from "bun:test";
import type { Stroke, ThresholdPlay } from "@tablewright/schema";
import {
  DEFAULT_MOVER,
  DEFAULT_RULE,
  chooseRoute,
  derive,
  findRoute,
  jumpsFrom,
  mansionStrokes,
  reach,
  routes,
  stepCost,
  type Cell,
  type Mover,
  type Route,
} from "../src/index.js";

// The mansion at twenty by fifteen: the hall west (cols 1-8, rows 3-11),
// the corridor (cols 9-10), the wings east, the gallery raised 10 ft over
// the hall's north with stairs down into the corridor, a 10 ft pit in the
// south-east wing at cols 14-15 rows 9-10, and the south row raised 5 ft
// from col 11 on.
const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const mansion = (play: ThresholdPlay[] = []) => derive(mansionStrokes(), bounds, play);
const at = (col: number, row: number): Cell => ({ col, row });
const rule = DEFAULT_RULE;
const walker: Mover = DEFAULT_MOVER;
const climber: Mover = { walk: 30, climb: 20, strength: 10 };
const flier: Mover = { walk: 30, fly: 60, strength: 10 };
const onFoot = { drops: false, diagonals: 0 };
const willing = { drops: true, diagonals: 0 };

describe("one step", () => {
  const house = mansion();

  test("open ground costs a cell and difficult ground two", () => {
    expect(stepCost(house, at(4, 10), at(4, 11), walker, rule, onFoot)?.cost).toBe(5);
    expect(stepCost(house, at(4, 11), at(4, 12), walker, rule, onFoot)).toEqual({
      kind: "walk",
      cost: 10,
      rise: 0,
      dice: 0,
    });
  });

  test("a wall or a shut door blocks; an open door and an arch pass", () => {
    expect(stepCost(house, at(8, 7), at(9, 7), walker, rule, onFoot)?.cost).toBe(5);
    expect(stepCost(house, at(8, 8), at(9, 8), walker, rule, onFoot)).toBeUndefined();
    expect(stepCost(house, at(10, 3), at(11, 3), walker, rule, onFoot)).toBeUndefined();
    expect(stepCost(house, at(15, 6), at(15, 7), walker, rule, onFoot)).toBeUndefined();
    const opened = mansion([{ edge: { col: 15, row: 6, side: "south" }, state: "open" }]);
    expect(stepCost(opened, at(15, 6), at(15, 7), walker, rule, onFoot)?.cost).toBe(5);
  });

  test("a diagonal needs both ways round the corner open", () => {
    // Into the corridor past the door's post: the way over the wall is shut.
    expect(stepCost(house, at(8, 6), at(9, 7), walker, rule, onFoot)).toBeUndefined();
    expect(stepCost(house, at(3, 8), at(4, 9), walker, rule, onFoot)?.cost).toBe(5);
  });

  test("void stops everyone and air only those on foot", () => {
    expect(stepCost(house, at(1, 5), at(0, 5), walker, rule, onFoot)).toBeUndefined();
    expect(stepCost(house, at(1, 5), at(0, 5), flier, rule, onFoot)).toBeUndefined();
    expect(stepCost(house, at(14, 2), at(15, 2), walker, rule, onFoot)).toBeUndefined();
    expect(stepCost(house, at(14, 2), at(15, 2), flier, rule, onFoot)).toEqual({
      kind: "fly",
      cost: 5,
      rise: 0,
      dice: 0,
    });
  });

  test("a rise past a step is a climb at 2:1, 1:1 with a climb speed, and a walk on stairs", () => {
    expect(stepCost(house, at(14, 9), at(13, 9), walker, rule, onFoot)).toEqual({
      kind: "climb",
      cost: 25,
      rise: 10,
      dice: 0,
    });
    expect(stepCost(house, at(14, 9), at(13, 9), climber, rule, onFoot)?.cost).toBe(15);
    // Down the stairs from the gallery through the arch: more than a step
    // down the painted slope, walked all the same.
    const stairs = stepCost(house, at(8, 1), at(9, 1), walker, rule, onFoot);
    expect(stairs?.kind).toBe("walk");
    expect(stairs?.cost).toBe(5);
    expect(stairs?.rise).toBeLessThan(-5);
  });

  test("a drop is free with a die for every ten feet, and only when the mover is willing", () => {
    expect(stepCost(house, at(13, 9), at(14, 9), walker, rule, onFoot)).toBeUndefined();
    expect(stepCost(house, at(13, 9), at(14, 9), walker, rule, willing)).toEqual({
      kind: "drop",
      cost: 5,
      rise: -10,
      dice: 1,
    });
    const strip: Stroke[] = [
      {
        ink: "ground",
        look: "data",
        shape: { kind: "rect", rect: { col0: 0, row0: 0, col1: 3, row1: 0 } },
        state: "ground",
        visibility: "party",
      },
      {
        ink: "height",
        shape: { kind: "rect", rect: { col0: 0, row0: 0, col1: 1, row1: 0 } },
        value: 25,
        visibility: "party",
      },
    ];
    const ledge = derive(strip, { colMin: 0, rowMin: 0, cols: 4, rows: 1 });
    expect(stepCost(ledge, at(1, 0), at(2, 0), walker, rule, willing)?.dice).toBe(2);
    expect(stepCost(ledge, at(2, 0), at(1, 0), walker, rule, onFoot)?.cost).toBe(55);
  });

  test("diagonals count by the rule", () => {
    const alternate = { ...rule, diagonals: "alternate" as const };
    const exact = { ...rule, diagonals: "exact" as const };
    expect(stepCost(house, at(3, 8), at(4, 9), walker, alternate, onFoot)?.cost).toBe(5);
    expect(
      stepCost(house, at(3, 8), at(4, 9), walker, alternate, { drops: false, diagonals: 1 })?.cost
    ).toBe(10);
    expect(stepCost(house, at(3, 8), at(4, 9), walker, exact, onFoot)?.cost).toBeCloseTo(7.07, 2);
  });

  test("a long jump clears the pit as far as Strength reaches", () => {
    const strong: Mover = { walk: 30, strength: 14 };
    const weak: Mover = { walk: 30, strength: 5 };
    expect(jumpsFrom(house, at(13, 9), strong, rule)).toEqual([
      { to: at(16, 9), cost: 15, gap: 10, over: [at(14, 9), at(15, 9)] },
    ]);
    expect(jumpsFrom(house, at(13, 9), weak, rule)).toEqual([]);
    expect(jumpsFrom(house, at(13, 9), flier, rule)).toEqual([]);
  });
});

describe("a route", () => {
  test("from the hall to the corridor through the open door is 30 ft", () => {
    const route = findRoute(mansion(), at(3, 8), at(9, 7), walker, rule);
    expect(route?.cost).toBe(30);
    expect(route?.steps.map((step) => step.cell)).toContainEqual(at(8, 7));
    expect(route?.steps.at(-1)?.cell).toEqual(at(9, 7));
    expect(route?.steps[0]).toEqual({ cell: at(3, 8), kind: "start", rise: 0, cost: 0, dice: 0 });
    expect(route?.kinds).toEqual(new Set(["walk"]));
  });

  test("a locked door and a shut one keep the north-east wing out of reach until play opens one", () => {
    expect(findRoute(mansion(), at(3, 8), at(12, 3), walker, rule)).toBeUndefined();
    const opened = mansion([{ edge: { col: 15, row: 6, side: "south" }, state: "open" }]);
    expect(findRoute(opened, at(3, 8), at(12, 3), walker, rule)).toBeDefined();
  });

  test("across the hall the diagonals count by the rule", () => {
    const house = mansion();
    const cost = (diagonals: "equal" | "alternate" | "exact") =>
      findRoute(house, at(2, 4), at(6, 8), walker, { ...rule, diagonals })?.cost;
    expect(cost("equal")).toBe(20);
    expect(cost("alternate")).toBe(30);
    expect(cost("exact")).toBeCloseTo(28.28, 2);
  });

  test("the quick route drops into the pit where the safe one cannot go", () => {
    const both = routes(mansion(), at(13, 9), at(14, 9), walker, rule);
    expect(both.safe).toBeUndefined();
    expect(both.quick?.cost).toBe(5);
    expect(both.quick?.dice).toBe(1);
    expect(both.quick?.kinds).toEqual(new Set(["drop"]));
    // Where no fall shortens the way there is only the safe route.
    expect(routes(mansion(), at(3, 8), at(9, 7), walker, rule).quick).toBeUndefined();
  });

  test("the reach set holds what this turn's movement covers", () => {
    const costs = reach(mansion(), at(3, 8), walker, rule, 30);
    const cost = (cell: Cell) => costs[cell.row * bounds.cols + cell.col];
    expect(cost(at(3, 8))).toBe(0);
    expect(cost(at(9, 7))).toBe(30);
    expect(cost(at(4, 12))).toBe(25);
    expect(cost(at(12, 3))).toBe(Infinity);
    expect(cost(at(10, 3))).toBe(Infinity);
  });
});

describe("the route this turn takes", () => {
  const route = (cost: number): Route => ({ steps: [], cost, dice: 0, kinds: new Set() });

  test("safe within movement, else the shortest, else a dash, else refused", () => {
    const both = { safe: route(40), quick: route(20) };
    expect(chooseRoute(both, { speed: 30, spent: 0, dashed: false })).toEqual({
      route: both.quick,
      phase: "move",
    });
    expect(chooseRoute(both, { speed: 30, spent: 20, dashed: false })).toEqual({
      route: both.safe,
      phase: "dash",
    });
    expect(chooseRoute(both, { speed: 30, spent: 20, dashed: false }, "quick").route).toBe(
      both.quick
    );
    // Refused either way, the preferred route is still the one shown.
    expect(chooseRoute(both, { speed: 30, spent: 20, dashed: true })).toEqual({
      route: both.safe,
      phase: "refused",
      reason: "spent",
    });
    expect(chooseRoute({ safe: route(100) }, { speed: 30, spent: 0, dashed: false })).toEqual({
      route: both.safe === undefined ? undefined : route(100),
      phase: "refused",
      reason: "beyond",
    });
    expect(chooseRoute({}, { speed: 30, spent: 0, dashed: false })).toEqual({
      route: undefined,
      phase: "refused",
      reason: "none",
    });
  });
});
