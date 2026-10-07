import { describe, expect, test } from "bun:test";
import type { SidePoint, SideToken, SideView, Verdict } from "@tablewright/board";
import {
  cardWindow,
  scaleIn,
  wholeWindow,
  type PlotWindow,
} from "../src/molecules/side-view/window.js";

// A card's plot leaves this much room to draw in, in pixels.
const room = { width: 232, height: 96 };
const CELL = 5;

// Open floor from 5 ft behind the origin to 100 ft out, and a 3D cone
// from a dragon's middle 2.5 ft up, level, 90 ft long.
const floor: SidePoint[] = [
  { along: -5, z: 0 },
  { along: 100, z: 0 },
];
const view = (over: Partial<SideView> = {}): SideView => ({
  label: "90 ft cone, 53°",
  unit: "ft",
  cell: CELL,
  from: -5,
  to: 100,
  origin: 2.5,
  pitch: 0,
  ground: floor,
  uprights: [],
  area: [
    { along: 0, z: 2.5 },
    { along: 80, z: 42.5 },
    { along: 90, z: 2.5 },
    { along: 80, z: -37.5 },
  ],
  lands: [],
  tokens: [],
  source: undefined,
  ...over,
});

const token = (along: number, verdict: Verdict, z = 0): SideToken => ({
  id: "C",
  label: "C",
  along,
  z,
  verdict,
});
const caught = (along: number): Verdict => ({
  kind: "caught",
  out: along,
  ground: 0,
  elevation: 0,
});

const holds = (window: PlotWindow, point: SidePoint): boolean =>
  point.along >= window.from &&
  point.along <= window.to &&
  point.z >= window.low &&
  point.z <= window.high;

// How large a cell is drawn, in pixels.
const cellPixels = (window: PlotWindow): number => scaleIn(window, room) * CELL;

describe("what a card closes in on", () => {
  test("a token near the origin is shown with the origin, a cell large enough to read", () => {
    const window = cardWindow(view(), token(15, caught(15)), room);
    expect(holds(window, { along: 0, z: 2.5 })).toBe(true);
    expect(holds(window, { along: 17.5, z: 5 })).toBe(true);
    expect(cellPixels(window)).toBeGreaterThanOrEqual(17);
  });

  test("a token far down the line leaves the origin out rather than shrink past reading", () => {
    const window = cardWindow(view(), token(85, caught(85)), room);
    expect(holds(window, { along: 0, z: 2.5 })).toBe(false);
    expect(holds(window, { along: 82.5, z: 0 })).toBe(true);
    expect(holds(window, { along: 87.5, z: 5 })).toBe(true);
  });

  test("a token behind the origin keeps the origin, which is what it is behind", () => {
    const behind: Verdict = { kind: "off", side: "behind" };
    const window = cardWindow(view({ from: -90 }), token(-80, behind), room);
    expect(holds(window, { along: 0, z: 2.5 })).toBe(true);
  });

  test("a line stopped by a wall shows where it stops and the wall's top", () => {
    const hidden: Verdict = {
      kind: "hidden",
      by: "wall",
      height: 30,
      at: { along: 60, z: 2.5 },
    };
    const window = cardWindow(view(), token(70, hidden), room);
    expect(holds(window, { along: 60, z: 2.5 })).toBe(true);
    expect(holds(window, { along: 60, z: 30 })).toBe(true);
  });

  test("a template passing over shows its underside above the head", () => {
    const over: Verdict = { kind: "over", gap: 10 };
    const window = cardWindow(view(), token(40, over), room);
    expect(holds(window, { along: 40, z: 15 })).toBe(true);
  });

  test("a token past the far end shows where the template ends", () => {
    const past: Verdict = { kind: "off", side: "past" };
    const window = cardWindow(view({ to: 110 }), token(105, past), room);
    expect(holds(window, { along: 90, z: 2.5 })).toBe(true);
  });

  test("a token up on a dais keeps the floor below it on the plot's foot", () => {
    const dais: SidePoint[] = [
      { along: -5, z: 0 },
      { along: 20, z: 0 },
      { along: 20, z: 10 },
      { along: 40, z: 10 },
    ];
    const window = cardWindow(view({ ground: dais }), token(22.5, caught(22.5), 10), room);
    expect(window.low).toBe(0);
  });

  test("the window fills the card's plot at one scale both ways", () => {
    const window = cardWindow(view(), token(15, caught(15)), room);
    const across = (window.to - window.from) / (window.high - window.low);
    expect(across).toBeCloseTo(room.width / room.height, 6);
  });

  test("a lone token is never drawn larger than a cell can be", () => {
    const one = view({ area: [] });
    const window = cardWindow(one, token(-30, { kind: "off", side: "beside" }), {
      width: 2000,
      height: 1000,
    });
    expect(scaleIn(window, { width: 2000, height: 1000 }) * CELL).toBeCloseTo(44, 6);
  });
});

describe("what the strip shows", () => {
  test("the whole slice, from its start to its end and from the floor to the template's top", () => {
    expect(wholeWindow(view())).toEqual({ from: -5, to: 100, low: 0, high: 42.5 });
  });
});
