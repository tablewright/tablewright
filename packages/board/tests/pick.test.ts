import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RULE,
  Picked,
  THE_AREA,
  TokenRings,
  boxHits,
  carriedCell,
  carriedPoint,
  clickHit,
  footprint,
  isStill,
  offsetOf,
  pickedAfter,
  ringedTokens,
  ringsOf,
  selectPress,
  showsAdding,
  standingAfter,
  stepOf,
  tokenThing,
  type Area,
  type Thing,
} from "../src/index.js";

const rule = DEFAULT_RULE;
const token = (id: string, col: number, row: number) => ({ id, cell: { col, row } });
const box = (x0: number, y0: number, x1: number, y1: number) => ({
  from: { x: x0, y: y0 },
  to: { x: x1, y: y1 },
});

// A ring 20 ft out with a hole 10 ft in, centred on the middle of (10, 10):
// in cells, out to 4 from (10.5, 10.5) and hollow within 2 of it.
const ring: Area = {
  kind: "circle",
  reaches: "line-of-sight",
  radius: 20,
  inner: 10,
  form: "sphere",
  height: 20,
};
const ringPrint = footprint(ring, { x: 52.5, y: 52.5, z: 2.5 }, rule);

// A breath aimed east from the middle of (2, 2), 30 ft long: in cells it
// runs from x 2.5 to 8.5 along row 2's middle.
const breath: Area = {
  kind: "cone",
  reaches: "line-of-sight",
  yaw: 90,
  pitch: 0,
  length: 30,
  spread: 53.13,
  edge: "round",
  form: "3d",
  height: 5,
};
const breathPrint = footprint(breath, { x: 12.5, y: 12.5, z: 2.5 }, rule);

const a = tokenThing("A");
const b = tokenThing("B");
const c = tokenThing("C");

describe("what a box touches", () => {
  test("a box over two tokens and a template picks all three, tokens first", () => {
    const tokens = [token("A", 1, 6), token("B", 4, 6), token("C", 15, 6)];
    // From (0.5, 5.5) to (5.5, 3): over A and B, and up into the breath.
    const hits = boxHits(box(0.5, 6.5, 5.5, 3), tokens, breathPrint);
    expect(hits).toEqual([a, b, THE_AREA]);
  });

  test("a box touches a token's cell by its corner, and not from just short of it", () => {
    const tokens = [token("A", 4, 4)];
    expect(boxHits(box(1, 1, 4.01, 4.01), tokens, undefined)).toEqual([a]);
    expect(boxHits(box(1, 1, 3.99, 3.99), tokens, undefined)).toEqual([]);
  });

  test("a box inside a ring's hole touches nothing, and across the hole's edge touches the ring", () => {
    expect(boxHits(box(10, 10, 11, 11), [], ringPrint)).toEqual([]);
    expect(boxHits(box(10, 10, 12.8, 11), [], ringPrint)).toEqual([THE_AREA]);
  });

  test("a box inside the footprint, round all of it, or across one edge touches it", () => {
    // Between the hole and the rim, east of the centre.
    expect(boxHits(box(13, 10.4, 13.6, 10.6), [], ringPrint)).toEqual([THE_AREA]);
    // Round the whole breath.
    expect(boxHits(box(0, 0, 10, 6), [], breathPrint)).toEqual([THE_AREA]);
    // A thin box from north of the breath to south of it, with no corner in.
    expect(boxHits(box(5, -2, 5.1, 8), [], breathPrint)).toEqual([THE_AREA]);
  });

  test("a box beside the footprint does not touch it", () => {
    expect(boxHits(box(0, 8, 3, 12), [], breathPrint)).toEqual([]);
    expect(boxHits(box(15.1, 10, 17, 11), [], ringPrint)).toEqual([]);
  });

  test("a click picks the token on its cell over the template, else the template, else nothing", () => {
    const tokens = [token("A", 4, 2)];
    expect(clickHit({ x: 4.5, y: 2.5 }, tokens, breathPrint)).toEqual(a);
    expect(clickHit({ x: 6.5, y: 2.5 }, tokens, breathPrint)).toEqual(THE_AREA);
    expect(clickHit({ x: 6.5, y: 9.5 }, tokens, breathPrint)).toBeUndefined();
    // The hole of a ring is not the ring.
    expect(clickHit({ x: 10.5, y: 10.5 }, [], ringPrint)).toBeUndefined();
  });
});

describe("what is picked", () => {
  test("without Shift a box or a click replaces what was picked", () => {
    expect(pickedAfter([a, b], [c], "replace")).toEqual([c]);
    expect(pickedAfter([a, b], [], "replace")).toEqual([]);
  });

  test("Shift adds after what was picked, in the order picked, each once", () => {
    expect(pickedAfter([b, THE_AREA], [a, b, c], "add")).toEqual([b, THE_AREA, a, c]);
  });

  test("Shift-click takes out what was picked and adds what was not", () => {
    expect(pickedAfter([a, b, THE_AREA], [b], "toggle")).toEqual([a, THE_AREA]);
    expect(pickedAfter([a], [THE_AREA], "toggle")).toEqual([a, THE_AREA]);
    expect(pickedAfter([a, b], [], "toggle")).toEqual([a, b]);
  });

  test("the plan's check: a box over two tokens and a template picks three, and Shift adds a fourth", () => {
    const tokens = [token("A", 1, 6), token("B", 4, 6), token("C", 15, 6)];
    const boxed = pickedAfter([], boxHits(box(0.5, 6.5, 5.5, 3), tokens, breathPrint), "replace");
    expect(boxed).toHaveLength(3);
    const hit = clickHit({ x: 15.5, y: 6.5 }, tokens, breathPrint);
    expect(hit).toEqual(c);
    const shifted = pickedAfter(boxed, hit === undefined ? [] : [hit], "toggle");
    expect(shifted).toEqual([a, b, THE_AREA, c]);
  });

  test("the set tells its listeners only when it changes, and keeps its order", () => {
    const picked = new Picked();
    const heard: (readonly Thing[])[] = [];
    picked.onChange((things) => heard.push(things));
    picked.set([b, a]);
    picked.set([tokenThing("B"), tokenThing("A")]);
    expect(heard).toHaveLength(1);
    expect(picked.tokenIds).toEqual(["B", "A"]);
    picked.set([a, b]);
    expect(heard).toHaveLength(2);
  });

  test("one token alone moves by its rules; a token with anything else, or a template, does not", () => {
    const picked = new Picked();
    picked.set([a]);
    expect(picked.loneToken).toBe("A");
    picked.set([a, THE_AREA]);
    expect(picked.loneToken).toBeUndefined();
    picked.set([THE_AREA]);
    expect(picked.loneToken).toBeUndefined();
    expect(picked.has(THE_AREA)).toBe(true);
  });
});

describe("a free placement", () => {
  test("a drag carries what is picked its travel rounded to whole cells", () => {
    expect(offsetOf({ x: 3.9, y: 2.1 }, { x: 5.95, y: 0.2 })).toEqual({ cols: 2, rows: -2 });
    // Half a cell is enough to carry it one, wherever the press landed.
    expect(offsetOf({ x: 3.9, y: 2.1 }, { x: 4.4, y: 2.1 })).toEqual({ cols: 1, rows: 0 });
    expect(offsetOf({ x: 3.1, y: 2.1 }, { x: 3.59, y: 2.1 })).toEqual({ cols: 0, rows: 0 });
  });

  test("a drag that went nowhere carries nothing, with no negative nought", () => {
    const still = offsetOf({ x: 3.5, y: 2.5 }, { x: 3.2, y: 2.3 });
    expect(isStill(still)).toBe(true);
    expect(Object.is(still.cols, 0)).toBe(true);
    expect(Object.is(still.rows, 0)).toBe(true);
  });

  test("each picked token lands its offset away and the rest stay, in order", () => {
    const tokens = [token("A", 1, 1), token("B", 4, 6), token("C", 9, 9)];
    const after = standingAfter(tokens, new Set(["A", "C"]), { cols: -1, rows: 2 });
    expect(after).toEqual([token("A", 0, 3), token("B", 4, 6), token("C", 8, 11)]);
    expect(carriedCell({ col: 0, row: 0 }, { cols: 3, rows: -1 })).toEqual({ col: 3, row: -1 });
  });

  test("a template's origin is carried the same cells in the rule's unit", () => {
    expect(carriedPoint({ x: 12.5, y: 15 }, { cols: 2, rows: -1 }, rule.cellSize)).toEqual({
      x: 22.5,
      y: 10,
    });
  });

  test("the arrow keys and WASD each step one cell", () => {
    expect(stepOf("ArrowLeft")).toEqual({ cols: -1, rows: 0 });
    expect(stepOf("s")).toEqual({ cols: 0, rows: 1 });
    expect(stepOf("D")).toEqual({ cols: 1, rows: 0 });
    expect(stepOf("q")).toBeUndefined();
  });
});

describe("what wears the ring", () => {
  test("every picked token wears it, a lone one too, and a template is not a token", () => {
    expect(ringedTokens([b, THE_AREA, a], undefined)).toEqual(["B", "A"]);
    expect(ringedTokens([a], undefined)).toEqual(["A"]);
  });

  test("the token under a Shift-held pointer wears it unless it is picked already", () => {
    expect(ringedTokens([a], "C")).toEqual(["A", "C"]);
    expect(ringedTokens([a, c], "C")).toEqual(["A", "C"]);
    expect(ringedTokens([], "C")).toEqual(["C"]);
  });

  test("a token both caught and picked wears one ring, as strong as either asks", () => {
    const caught = {
      cells: [
        { col: 2, row: 3 },
        { col: 4, row: 4 },
      ],
      alpha: 0.4,
    };
    const picked = {
      cells: [
        { col: 4, row: 4 },
        { col: 9, row: 1 },
      ],
      alpha: 1,
    };
    expect(ringsOf([caught, picked])).toEqual([
      { cell: { col: 2, row: 3 }, alpha: 0.4 },
      { cell: { col: 4, row: 4 }, alpha: 1 },
      { cell: { col: 9, row: 1 }, alpha: 1 },
    ]);
  });

  test("the rings turn while any shows, and stand still when asked for less motion", () => {
    const rings = new TokenRings({ cellSize: 50, originX: 0, originY: 0 });
    expect(rings.tick(0, false)).toBe(false);
    rings.hold("area", [{ col: 1, row: 1 }]);
    expect(rings.tick(16, false)).toBe(true);
    expect(rings.tick(32, true)).toBe(false);
    rings.hold("area", []);
    rings.hold("picked", [{ col: 3, row: 3 }]);
    expect(rings.tick(48, false)).toBe(true);
    rings.hold("picked", []);
    expect(rings.isShowing).toBe(false);
    expect(rings.tick(64, false)).toBe(false);
  });
});

describe("a press under Select", () => {
  test("on something picked it carries, for a hand that may move it", () => {
    expect(selectPress(false, true, true)).toBe("carry");
    expect(selectPress(false, true, false)).toBe("pick");
  });

  test("with Shift held it always picks, and anywhere else it picks", () => {
    expect(selectPress(true, true, true)).toBe("pick");
    expect(selectPress(false, false, true)).toBe("pick");
  });

  test("the board shows the hand adding only while Select is held with Shift down", () => {
    expect(showsAdding("select", true)).toBe(true);
    expect(showsAdding("select", false)).toBe(false);
    expect(showsAdding("move", true)).toBe(false);
    expect(showsAdding(undefined, true)).toBe(false);
  });
});
