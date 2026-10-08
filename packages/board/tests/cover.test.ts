import { describe, expect, test } from "bun:test";
import type { Stroke } from "@tablewright/schema";
import {
  DEFAULT_RULE,
  aimOf,
  aimViewOf,
  cellCentre,
  coverFor,
  coverOf,
  derive,
  firstBlock,
  heightAt,
  mansionStrokes,
  pairOf,
  THE_AREA,
  tokenThing,
  type Cell,
  type TokenView,
  type Topology,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const mansion = derive(mansionStrokes(), bounds);
const rule = DEFAULT_RULE;

// A token standing on the ground the field gives its cell, as the board hands it over.
const token = (id: string, col: number, row: number, house: Topology = mansion): TokenView => ({
  id,
  label: id,
  cell: { col, row },
  facing: 0,
  height: heightAt(house, { col, row }),
});

// The cover `to` has from `from`, the way a line between two tokens asks it.
const coverBetween = (from: Cell, to: Cell, house: Topology = mansion) =>
  aimOf(token("A", from.col, from.row, house), token("T", to.col, to.row, house), house, rule)
    .cover;

describe("cover from a line between two tokens", () => {
  test("from the hall floor, the dais's lip gives one standing back on it half cover", () => {
    // The dais is twenty-five feet up across the west wing's top two rows;
    // the target stands on its back row, the attacker on the hall's far row,
    // looking north through the arch.
    const aim = aimOf(token("A", 4, 13), token("T", 4, 1), mansion, rule);
    // Twelve cells across and twenty-five feet up is sixty feet, the greatest axis.
    expect(aim.distance).toBe(60);
    expect(aim.cover.cover).toBe("half");
    expect(aim.cover.share).toBeCloseTo(9 / 15, 9);
    expect(aim.cover.hiders).toHaveLength(1);
    const [lip] = aim.cover.hiders;
    expect(lip?.stop.by).toBe("ground");
    expect(lip?.stop.by === "ground" ? lip.stop.height : undefined).toBe(25);
    expect(lip?.part).toBe("lower");
    expect(lip?.cover).toBe("half");
    // The lowest three heights of each column are stopped, the top two clear.
    for (const ray of aim.cover.rays) {
      expect(ray.stop !== undefined).toBe(ray.row < 3);
    }
  });

  test("the nearer the lip, the more of the target it hides", () => {
    const from = (row: number) => coverBetween({ col: 4, row }, { col: 4, row: 1 }).cover;
    expect(from(13)).toBe("half");
    expect(from(12)).toBe("three-quarters");
    expect(from(10)).toBe("three-quarters");
    expect(from(9)).toBe("total");
    // One standing at the very edge shows all but its feet to the hall.
    const edge = coverBetween({ col: 4, row: 13 }, { col: 4, row: 2 });
    expect(edge.cover).toBe("none");
    expect(edge.share).toBeCloseTo(3 / 15, 9);
    expect(edge.hiders[0]?.part).toBe("lower");
    // All of it hidden is all of it.
    expect(coverBetween({ col: 4, row: 9 }, { col: 4, row: 1 }).hiders[0]?.part).toBe("all");
  });

  test("through a shut window there is no cover from the glass", () => {
    // From outside the west wing, through its small window on (0, 6).
    const cover = coverBetween({ col: 0, row: 6 }, { col: 3, row: 6 });
    expect(cover.cover).toBe("none");
    expect(cover.share).toBe(0);
    expect(cover.hiders).toEqual([]);
    // The line of effect on the plan, by contrast, stops at the glass.
    const glass = firstBlock(
      mansion,
      cellCentre({ col: 0, row: 6 }),
      cellCentre({ col: 3, row: 6 }),
      "effect"
    );
    expect(glass?.edge.edge).toEqual({ col: 0, row: 6, side: "east" });
  });

  test("a wall that hides all of the target is total cover", () => {
    const cover = coverBetween({ col: 3, row: 8 }, { col: 12, row: 8 });
    expect(cover.cover).toBe("total");
    expect(cover.share).toBe(1);
    expect(cover.hiders).toHaveLength(1);
    const [wall] = cover.hiders;
    expect(wall?.stop.by === "edge" ? wall.stop.edge.edge : undefined).toEqual({
      col: 8,
      row: 8,
      side: "east",
    });
    expect(wall?.part).toBe("all");
    expect(wall?.cover).toBe("total");
  });

  test("a wall's end hides the side of the target behind it", () => {
    // One wall on open ground, a cell long, across the line from (5, 9)
    // to (4, 1): it reaches from the west as far as the line's middle.
    const wall: Stroke = {
      ink: "wall",
      shape: { kind: "line", edges: [{ col: 4, row: 4, side: "south" }] },
      look: "data",
      visibility: "party",
    };
    const open = derive([wall], bounds);
    const cover = coverBetween({ col: 5, row: 9 }, { col: 4, row: 1 }, open);
    expect(cover.hiders).toHaveLength(1);
    expect(cover.hiders[0]?.part).toBe("left");
    // Two columns of three, every height.
    expect(cover.share).toBeCloseTo(10 / 15, 9);
    expect(cover.cover).toBe("half");
  });

  test("open ground gives no cover, and the target's own cell straight up gives none either", () => {
    const flat = derive([], bounds);
    expect(coverBetween({ col: 2, row: 2 }, { col: 9, row: 7 }, flat).cover).toBe("none");
    const above = coverOf(
      flat,
      { x: 3.5, y: 3.5, z: 20 },
      { cell: { col: 3, row: 3 }, foot: 0 },
      rule
    );
    expect(above.cover).toBe("none");
    expect(above.rays).toHaveLength(15);
  });
});

describe("the degree a share gives", () => {
  test("the SRD's shares: half, three quarters, and all of it", () => {
    const srd = DEFAULT_RULE.cover;
    expect(coverFor(0, srd)).toBe("none");
    expect(coverFor(7 / 15, srd)).toBe("none");
    expect(coverFor(8 / 15, srd)).toBe("half");
    expect(coverFor(0.5, srd)).toBe("half");
    expect(coverFor(11 / 15, srd)).toBe("half");
    expect(coverFor(0.75, srd)).toBe("three-quarters");
    expect(coverFor(14 / 15, srd)).toBe("three-quarters");
    expect(coverFor(1, srd)).toBe("total");
  });

  test("a system's own shares", () => {
    const strict = { half: 0.4, threeQuarters: 0.7, total: 0.9 };
    expect(coverFor(6 / 15, strict)).toBe("half");
    expect(coverFor(11 / 15, strict)).toBe("three-quarters");
    expect(coverFor(14 / 15, strict)).toBe("total");
    // The same lip, judged by a system that asks less.
    const lenient = { half: 0.25, threeQuarters: 0.5, total: 0.75 };
    const aim = aimOf(token("A", 4, 13), token("T", 4, 1), mansion, { ...rule, cover: lenient });
    expect(aim.cover.cover).toBe("three-quarters");
  });
});

describe("the pair a line runs between", () => {
  test("exactly two tokens, from the first picked to the second", () => {
    expect(pairOf([tokenThing("a"), tokenThing("b")])).toEqual({ from: "a", to: "b" });
    expect(pairOf([tokenThing("b"), tokenThing("a")])).toEqual({ from: "b", to: "a" });
  });

  test("one token, a template among them, or a third thing draws none", () => {
    expect(pairOf([])).toBeUndefined();
    expect(pairOf([tokenThing("a")])).toBeUndefined();
    expect(pairOf([tokenThing("a"), THE_AREA])).toBeUndefined();
    expect(pairOf([THE_AREA, tokenThing("a"), tokenThing("b")])).toBeUndefined();
    expect(pairOf([tokenThing("a"), tokenThing("b"), tokenThing("c")])).toBeUndefined();
  });
});

describe("a line's side view", () => {
  test("the card's slice runs from the attacker to the target, its lines stopped at the lip", () => {
    const from = token("A", 4, 13);
    const to = token("T", 4, 1);
    const aim = aimOf(from, to, mansion, rule);
    const view = aimViewOf(aim, from, to, mansion, rule);
    expect(view.source?.id).toBe("A");
    expect(view.source?.along).toBe(0);
    expect(view.tokens).toHaveLength(1);
    const [target] = view.tokens;
    expect(target?.id).toBe("T");
    // Twelve cells north along the slice, on the dais.
    expect(target?.along).toBeCloseTo(60, 9);
    expect(target?.z).toBe(25);
    const verdict = target?.verdict;
    if (verdict?.kind !== "aimed") {
      throw new Error("the target is aimed at");
    }
    expect(verdict.cover).toBe("half");
    expect(verdict.ground).toBe(0);
    const stopped = verdict.rays.filter((ray) => ray.isStopped);
    expect(stopped).toHaveLength(9);
    // Each stopped where it meets the lip, ten and a half cells out, under its top.
    for (const ray of stopped) {
      expect(ray.end.along).toBeCloseTo(52.5, 9);
      expect(ray.end.z).toBeLessThan(25);
    }
    // The clear ones reach the target's face.
    for (const ray of verdict.rays.filter((one) => !one.isStopped)) {
      expect(ray.end.along).toBeCloseTo(60, 9);
    }
    expect(verdict.hiders).toEqual([
      expect.objectContaining({ by: "ground", height: 25, part: "lower", cover: "half" }),
    ]);
    // The ground along it climbs onto the dais at the lip.
    expect(view.ground.some((point) => point.z === 25 && Math.abs(point.along - 52.5) < 1e-9)).toBe(
      true
    );
  });
});
