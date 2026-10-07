import { describe, expect, test } from "bun:test";
import type { Stroke, ThresholdPlay } from "@tablewright/schema";
import {
  cellCentre,
  derive,
  edgeAt,
  firstBlock,
  firstStop,
  hasLineOfEffect,
  hasLineOfSight,
  mansionStrokes,
  passes,
  type Cell,
  type CellSpot,
  type Stop,
} from "../src/index.js";

const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const mansion = (play: ThresholdPlay[] = []) => derive(mansionStrokes(), bounds, play);
const at = (col: number, row: number): Cell => ({ col, row });
const spot = (x: number, y: number, z: number): CellSpot => ({ x, y, z });
const stoppedBy = (stop: Stop | undefined) =>
  stop?.by === "edge" ? stop.edge.edge : stop?.by === "ground" ? stop.height : undefined;

describe("what an edge lets through", () => {
  const house = mansion();
  const edge = (col: number, row: number, side: "east" | "south") =>
    edgeAt(house, { col, row, side });

  test("a wall stops everything and an arch nothing", () => {
    for (const passage of ["move", "sight", "effect"] as const) {
      expect(passes(edge(8, 8, "east"), passage)).toBe(false);
      expect(passes(edge(4, 11, "south"), passage)).toBe(true);
      expect(passes(undefined, passage)).toBe(true);
    }
  });

  test("a door lets all through open and nothing shut, locked or secret", () => {
    for (const passage of ["move", "sight", "effect"] as const) {
      expect(passes(edge(8, 7, "east"), passage)).toBe(true);
      expect(passes(edge(15, 6, "south"), passage)).toBe(false);
      expect(passes(edge(10, 3, "east"), passage)).toBe(false);
      expect(passes(edge(16, 11, "south"), passage)).toBe(false);
    }
  });

  test("a window shows the room beyond shut, and lets more through open or smashed", () => {
    const large = edge(18, 2, "east");
    expect(passes(large, "sight")).toBe(true);
    expect(passes(large, "effect")).toBe(false);
    expect(passes(large, "move")).toBe(false);
    const smashed = edgeAt(
      mansion([{ edge: { col: 18, row: 2, side: "east" }, state: "smashed" }]),
      {
        col: 18,
        row: 2,
        side: "east",
      }
    );
    expect(passes(smashed, "effect")).toBe(true);
    expect(passes(smashed, "move")).toBe(true);
    const openSmall = edgeAt(mansion([{ edge: { col: 0, row: 6, side: "east" }, state: "open" }]), {
      col: 0,
      row: 6,
      side: "east",
    });
    expect(passes(openSmall, "effect")).toBe(true);
    expect(passes(openSmall, "move")).toBe(false);
  });
});

describe("a straight line across the mansion", () => {
  test("stops at the first wall in its way and says where", () => {
    const house = mansion();
    expect(hasLineOfEffect(house, at(3, 8), at(12, 8))).toBe(false);
    const block = firstBlock(house, cellCentre(at(3, 8)), cellCentre(at(12, 8)), "effect");
    expect(block?.edge.edge).toEqual({ col: 8, row: 8, side: "east" });
    expect(block?.at).toEqual({ x: 9, y: 8.5 });
    expect(block?.t).toBeCloseTo(5.5 / 9, 6);
  });

  test("passes an open door and stops at the wall beyond", () => {
    const house = mansion();
    expect(hasLineOfEffect(house, at(3, 7), at(9, 7))).toBe(true);
    expect(hasLineOfSight(house, at(3, 7), at(9, 7))).toBe(true);
    const block = firstBlock(house, cellCentre(at(3, 7)), cellCentre(at(12, 7)), "effect");
    expect(block?.edge.edge).toEqual({ col: 10, row: 7, side: "east" });
  });

  test("a shut door blocks sight until play opens it; an arch never did", () => {
    expect(hasLineOfSight(mansion(), at(15, 5), at(15, 8))).toBe(false);
    const opened = mansion([{ edge: { col: 15, row: 6, side: "south" }, state: "open" }]);
    expect(hasLineOfSight(opened, at(15, 5), at(15, 8))).toBe(true);
    expect(hasLineOfEffect(mansion(), at(4, 10), at(4, 13))).toBe(true);
  });

  test("a secret door is a wall until it is worked", () => {
    expect(hasLineOfSight(mansion(), at(16, 10), at(16, 12))).toBe(false);
    const worked = mansion([{ edge: { col: 16, row: 11, side: "south" }, state: "open" }]);
    expect(hasLineOfSight(worked, at(16, 10), at(16, 12))).toBe(true);
  });

  test("a line along a wall is beside it, not through it", () => {
    // Along the hall's south wall inside the hall, edge to edge of the arches.
    const house = mansion();
    expect(
      firstBlock(house, { x: 1.5, y: 12 - 1e-6 }, { x: 8.5, y: 12 - 1e-6 }, "effect")
    ).toBeUndefined();
  });
});

describe("a straight line in three dimensions", () => {
  // A wall of its own, stood on the west wing's flat floor.
  const wallAt = (tall?: number): Stroke => ({
    ink: "wall",
    shape: { kind: "line", edges: [{ col: 4, row: 6, side: "east" }] },
    tall,
    look: "data",
    visibility: "party",
  });

  test("from the hall floor to someone on the dais, the lip stops it low down and it clears high up", () => {
    const house = mansion();
    // From half a cell above the hall floor, through the arch, to a token
    // standing a cell back from the lip: its feet are at the dais's ten.
    const floor = spot(4.5, 12.5, 2.5);
    const low = firstStop(house, floor, spot(4.5, 1.5, 10));
    expect(low?.by).toBe("ground");
    expect(stoppedBy(low)).toBe(10);
    expect(low?.at.x).toBeCloseTo(4.5, 9);
    expect(low?.at.y).toBeCloseTo(3, 9);
    expect(low?.t).toBeCloseTo(9.5 / 11, 9);
    expect(firstStop(house, floor, spot(4.5, 1.5, 15))).toBeUndefined();
    expect(firstStop(house, spot(4.5, 1.5, 15), floor)).toBeUndefined();
  });

  test("a low wall lets a line over it and a tall one does not", () => {
    const low = derive([...mansionStrokes(), wallAt(3)], bounds);
    const under = firstStop(low, spot(3.5, 6.5, 2.5), spot(6.5, 6.5, 2.5));
    expect(stoppedBy(under)).toEqual({ col: 4, row: 6, side: "east" });
    expect(under?.at).toEqual({ x: 5, y: 6.5 });
    expect(under?.t).toBeCloseTo(0.5, 9);
    expect(firstStop(low, spot(3.5, 6.5, 5), spot(6.5, 6.5, 5))).toBeUndefined();
    const tall = derive([...mansionStrokes(), wallAt()], bounds);
    expect(stoppedBy(firstStop(tall, spot(3.5, 6.5, 5), spot(6.5, 6.5, 5)))).toEqual({
      col: 4,
      row: 6,
      side: "east",
    });
    expect(firstStop(tall, spot(3.5, 6.5, 12), spot(6.5, 6.5, 12))).toBeUndefined();
  });

  test("a shut door stops it below the lintel and not above; an open one is a hole", () => {
    const house = mansion();
    const shut = firstStop(house, spot(15.5, 5.5, 2.5), spot(15.5, 8.5, 2.5));
    expect(stoppedBy(shut)).toEqual({ col: 15, row: 6, side: "south" });
    expect(shut?.at).toEqual({ x: 15.5, y: 7 });
    expect(firstStop(house, spot(15.5, 5.5, 12), spot(15.5, 8.5, 12))).toBeUndefined();
    const opened = mansion([{ edge: { col: 15, row: 6, side: "south" }, state: "open" }]);
    expect(firstStop(opened, spot(15.5, 5.5, 2.5), spot(15.5, 8.5, 2.5))).toBeUndefined();
    expect(stoppedBy(firstStop(house, spot(9.5, 3.5, 2.5), spot(11.5, 3.5, 2.5)))).toEqual({
      col: 10,
      row: 3,
      side: "east",
    });
    expect(firstStop(house, spot(7.5, 7.5, 2.5), spot(9.5, 7.5, 2.5))).toBeUndefined();
  });

  test("a window is a hole shut or not, frosted too, where the line of effect is stopped", () => {
    const house = mansion();
    const large = [spot(17.5, 2.5, 2.5), spot(19.5, 2.5, 2.5)] as const;
    expect(firstStop(house, ...large)).toBeUndefined();
    expect(firstBlock(house, ...large, "effect")?.edge.edge).toEqual({
      col: 18,
      row: 2,
      side: "east",
    });
    expect(firstStop(house, spot(17.5, 3.5, 2.5), spot(19.5, 3.5, 2.5))).toBeUndefined();
    expect(firstStop(house, spot(0.5, 6.5, 2.5), spot(1.5, 6.5, 2.5))).toBeUndefined();
  });

  test("a wall on the dais rises from the dais, not from the ground outside", () => {
    const house = mansion();
    // The north wall stands between the outside at nought and the dais at
    // ten: fifteen feet up is under its top, twenty-five over it.
    const north = { col: 4, row: 0, side: "south" } as const;
    expect(stoppedBy(firstStop(house, spot(4.5, 0.5, 15), spot(4.5, 1.5, 15)))).toEqual(north);
    expect(stoppedBy(firstStop(house, spot(4.5, 1.5, 15), spot(4.5, 0.5, 15)))).toEqual(north);
    expect(firstStop(house, spot(4.5, 0.5, 25), spot(4.5, 1.5, 25))).toBeUndefined();
  });

  test("a secret door is a wall until it is worked, standing on the gallery's floor", () => {
    // Between the room at nought and the gallery at five, so its top is fifteen.
    const secret = { col: 16, row: 11, side: "south" } as const;
    const line = [spot(16.5, 10.5, 12), spot(16.5, 12.5, 12)] as const;
    expect(stoppedBy(firstStop(mansion(), ...line))).toEqual(secret);
    const worked = mansion([{ edge: secret, state: "open" }]);
    expect(firstStop(worked, ...line)).toBeUndefined();
  });

  test("it is stopped where it drops into the ground, and may drop down into the pit", () => {
    const house = mansion();
    const drop = firstStop(house, spot(2.5, 5.5, 10), spot(6.5, 5.5, -10));
    expect(drop?.by).toBe("ground");
    expect(stoppedBy(drop)).toBe(0);
    expect(drop?.at.x).toBeCloseTo(4.5, 9);
    expect(drop?.at.y).toBeCloseTo(5.5, 9);
    expect(drop?.t).toBeCloseTo(0.5, 9);
    // Down the pit's own edge: level with the floor at its lip, then over
    // the pit's floor at minus ten.
    expect(firstStop(house, spot(13.5, 9.5, 2.5), spot(15.5, 9.5, -7.5))).toBeUndefined();
    const short = firstStop(house, spot(13.5, 9.5, 2.5), spot(14.5, 9.5, -5));
    expect(stoppedBy(short)).toBe(0);
    expect(short?.at.x).toBeCloseTo(13.5 + 1 / 3, 9);
  });

  test("straight up nothing stops it, and from under the ground it is stopped at once", () => {
    const house = mansion();
    expect(firstStop(house, spot(4.5, 5.5, 0), spot(4.5, 5.5, 30))).toBeUndefined();
    const buried = firstStop(house, spot(4.5, 1.5, 0), spot(4.5, 1.5, 30));
    expect(stoppedBy(buried)).toBe(10);
    expect(buried?.t).toBe(0);
    expect(buried?.at).toEqual({ x: 4.5, y: 1.5 });
  });

  test("beyond the map the ground is level at nought", () => {
    const bare = derive([], bounds);
    expect(firstStop(bare, spot(-3, -3, 1), spot(25, 20, 1))).toBeUndefined();
    const under = firstStop(bare, spot(-3, -3, -1), spot(25, 20, -1));
    expect(stoppedBy(under)).toBe(0);
    expect(under?.t).toBe(0);
  });
});
