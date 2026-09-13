import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MOVER,
  DEFAULT_RULE,
  FALL_MARK,
  RISE_MARK,
  badgeText,
  derive,
  mansionStrokes,
  measure,
  terraceHillStrokes,
  type Cell,
  type Measurement,
  type Route,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const at = (col: number, row: number): Cell => ({ col, row });
const tavern = derive([], bounds);
const hill = derive(terraceHillStrokes(), bounds);
const house = derive(mansionStrokes(), bounds);

describe("a measure across the tavern", () => {
  test("three across and four down is twenty feet, and twenty on foot within the move", () => {
    const found = measure(tavern, at(2, 2), at(5, 6), DEFAULT_RULE, DEFAULT_MOVER);
    expect(found.distance).toBe(20);
    expect(found.rise).toBe(0);
    expect(found.route?.cost).toBe(20);
    expect(found.choice.phase).toBe("move");
    expect(found.reach).toBe(30);
    expect(found.dashReach).toBe(60);
    expect(found.blockedAt).toBeUndefined();
    expect(found.seenBy).toBe("party");
    expect(badgeText(found, "line")).toBe("20 ft");
    expect(badgeText(found, "path")).toBe("20 ft");
  });

  test("a measure onto the same cell is nothing at all", () => {
    const found = measure(tavern, at(4, 4), at(4, 4), DEFAULT_RULE, DEFAULT_MOVER);
    expect(found.distance).toBe(0);
    expect(found.route?.cost).toBe(0);
    expect(badgeText(found, "line")).toBe("0 ft");
  });

  test("the far corner is beyond even a dash, and the badge says so with the number", () => {
    const found = measure(tavern, at(0, 0), at(19, 14), DEFAULT_RULE, DEFAULT_MOVER);
    expect(found.route?.cost).toBe(95);
    expect(found.choice.phase).toBe("refused");
    expect(found.choice.reason).toBe("beyond");
    expect(badgeText(found, "path")).toBe("Beyond dash: 95 ft");
  });
});

describe("a measure up the hill", () => {
  test("height is a third axis: fifteen feet up within four cells is still twenty feet", () => {
    const found = measure(hill, at(3, 3), at(6, 7), DEFAULT_RULE, DEFAULT_MOVER, "own");
    expect(found.distance).toBe(20);
    expect(found.rise).toBe(15);
    expect(found.route?.cost).toBe(20);
    // Kept to oneself, the badge says so beside the numbers.
    expect(found.seenBy).toBe("own");
    expect(badgeText(found, "line")).toBe(`20 ft ${RISE_MARK}15 — Just you`);
  });

  test("down is an arrow down", () => {
    const found = measure(hill, at(6, 7), at(3, 3), DEFAULT_RULE, DEFAULT_MOVER);
    expect(found.rise).toBe(-15);
    expect(badgeText(found, "line")).toBe(`20 ft ${FALL_MARK}15`);
  });

  test("across the hill takes a dash", () => {
    const found = measure(hill, at(2, 7), at(10, 7), DEFAULT_RULE, DEFAULT_MOVER);
    expect(found.choice.phase).toBe("dash");
    expect(found.choice.route?.cost).toBe(40);
    expect(badgeText(found, "path")).toBe("Dash: 40 ft");
  });
});

describe("a measure through the mansion", () => {
  test("the line of effect breaks at the first wall, and the way round takes a dash", () => {
    const found = measure(house, at(3, 8), at(12, 8), DEFAULT_RULE, DEFAULT_MOVER);
    expect(found.distance).toBe(45);
    expect(found.blockedAt).toEqual({ x: 9, y: 8.5 });
    expect(found.route?.cost).toBe(50);
    expect(badgeText(found, "line")).toBe("45 ft");
    expect(badgeText(found, "path")).toBe("Dash: 50 ft");
  });

  test("from the gallery the drop into the hall is offered over the long way round", () => {
    const found = measure(house, at(6, 1), at(6, 5), DEFAULT_RULE, DEFAULT_MOVER);
    expect(found.rise).toBe(-10);
    expect(found.choice.phase).toBe("move");
    expect(found.choice.route?.cost).toBe(20);
    expect(found.choice.route?.dice).toBe(1);
    expect(found.choice.route?.kinds).toEqual(new Set(["walk", "drop"]));
    expect(badgeText(found, "path")).toBe("20 ft, 1d6 fall");
  });

  test("a cell no one can reach has no way on foot", () => {
    // The small window at the west wall of row 6 is sight only.
    const found = measure(house, at(1, 6), at(0, 6), DEFAULT_RULE, DEFAULT_MOVER);
    expect(found.route).toBeUndefined();
    expect(found.choice.phase).toBe("refused");
    expect(badgeText(found, "line")).toBe("5 ft");
    expect(badgeText(found, "path")).toBe("No way");
  });
});

describe("the badge of a way with a drop", () => {
  test("names the dice of the fall", () => {
    const route: Route = { steps: [], cost: 15, dice: 2, kinds: new Set(["walk", "drop"]) };
    const found: Measurement = {
      from: at(0, 0),
      to: at(3, 0),
      distance: 15,
      rise: -20,
      unit: "ft",
      route,
      ways: { safe: route },
      choice: { route, phase: "move" },
      reach: 30,
      dashReach: 60,
      blockedAt: undefined,
      seenBy: "party",
    };
    expect(badgeText(found, "path")).toBe("15 ft, 2d6 fall");
  });
});
