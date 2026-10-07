import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RULE,
  catchesToken,
  caughtCells,
  derive,
  heightAt,
  heldSpan,
  holds,
  mansionStrokes,
  sideViewOf,
  surface,
  visibleTo,
  type Area,
  type SideToken,
  type SideView,
  type Spot,
  type TokenView,
  type Topology,
} from "../src/index.js";

type Cone = Extract<Area, { kind: "cone" }>;
type Rect = Extract<Area, { kind: "rect" }>;

const rule = DEFAULT_RULE;
const bounds = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
const house = derive(mansionStrokes(), bounds);
const at = (x: number, y: number, z = 0): Spot => ({ x, y, z });
const radians = (degrees: number) => (degrees * Math.PI) / 180;

// Aimed north up the map unless told otherwise, a 3D cone set to line of
// sight as the palette makes one.
const cone = (over: Partial<Cone> = {}): Cone => ({
  kind: "cone",
  reaches: "line-of-sight",
  yaw: 0,
  pitch: 0,
  length: 40,
  spread: 53.13,
  edge: "round",
  form: "3d",
  height: 5,
  ...over,
});

const rect = (over: Partial<Rect> = {}): Rect => ({
  kind: "rect",
  reaches: "line-of-sight",
  yaw: 90,
  pitch: 0,
  length: 30,
  width: 5,
  height: 20,
  form: "wall",
  ...over,
});

// A token standing on a cell of a scene, at the height its ground gives it,
// as the table hands them to the board.
const standing =
  (topology: Topology) =>
  (id: string, col: number, row: number, elevation = 0): TokenView => ({
    id,
    label: id,
    cell: { col, row },
    facing: 0,
    height: heightAt(topology, { col, row }),
    elevation,
  });
const onHouse = standing(house);

function viewOf(
  area: Area,
  origin: Spot,
  tokens: readonly TokenView[] = [],
  topology = house,
  source?: string
) {
  const view = sideViewOf(area, origin, topology, tokens, rule, source);
  if (view === undefined) {
    throw new Error("an aimed area has a side view");
  }
  return view;
}

const tokenIn = (view: SideView, id: string): SideToken => {
  const found = view.tokens.find((token) => token.id === id);
  if (found === undefined) {
    throw new Error(`${id} is not in the side view`);
  }
  return found;
};

const rounded = (value: number) => Math.round(value * 1000) / 1000;

describe("the ground along a slice", () => {
  test("steps where the field does, and a wall on the dais stands from the dais to its top", () => {
    // North from the middle of the cube at (4, 7) in the west wing: the
    // floor, the dais ten feet up from its lip to the north wall, and past
    // the wall the ground outside, level at nought.
    const view = viewOf(cone(), at(22.5, 37.5, 2.5));
    expect(view.from).toBe(-5);
    expect(view.to).toBeCloseTo(40, 1);
    expect(view.ground.map((point) => [rounded(point.along), point.z])).toEqual([
      [-5, 0],
      [22.5, 0],
      [22.5, 10],
      [32.5, 10],
      [32.5, 0],
      [rounded(view.to), 0],
    ]);
    expect(view.uprights).toEqual([{ along: 32.5, foot: 10, top: 20, kind: "wall" }]);
  });

  test("a shut door stands to its top, a window is a hole, and the pit behind is ground too", () => {
    // North from (15, 8) in the east wing through the shut door on (15, 6),
    // with the pit behind the origin.
    const door = viewOf(cone({ length: 30 }), at(77.5, 42.5, 2.5));
    expect(door.uprights.map((one) => ({ ...one, along: rounded(one.along) }))).toEqual([
      { along: 7.5, foot: 0, top: 10, kind: "door" },
    ]);
    expect(door.ground.slice(0, 3).map((point) => [rounded(point.along), point.z])).toEqual([
      [-5, -10],
      [-2.5, -10],
      [-2.5, 0],
    ]);
    // East from (14, 2) to the window in the east wing's far wall.
    const window = viewOf(cone({ yaw: 90, length: 30 }), at(72.5, 12.5, 2.5));
    expect(window.uprights).toEqual([]);
  });
});

describe("an area's slice", () => {
  const from = at(22.5, 37.5, 2.5);
  const angleOf = (point: { along: number; z: number }) =>
    (Math.atan2(point.z - from.z, point.along) * 180) / Math.PI;

  test("a cone is the wedge half its spread either side of its pitch, its round edge at the length", () => {
    for (const pitch of [0, -35, 20]) {
      const ring = viewOf(cone({ pitch }), from).area;
      expect(ring[0]).toEqual({ along: 0, z: from.z });
      const edge = ring.slice(1);
      for (const point of edge) {
        expect(Math.hypot(point.along, point.z - from.z)).toBeCloseTo(40, 9);
        expect(angleOf(point)).toBeGreaterThanOrEqual(pitch - 53.13 / 2 - 1e-9);
        expect(angleOf(point)).toBeLessThanOrEqual(pitch + 53.13 / 2 + 1e-9);
      }
      expect(angleOf(edge[0]!)).toBeCloseTo(pitch - 53.13 / 2, 9);
      expect(angleOf(edge[edge.length - 1]!)).toBeCloseTo(pitch + 53.13 / 2, 9);
    }
  });

  test("a flat far edge meets each side the length over the cosine of the half spread out", () => {
    const ring = viewOf(cone({ pitch: -35, edge: "flat" }), from).area;
    expect(ring).toHaveLength(3);
    const reach = 40 / Math.cos(radians(53.13 / 2));
    for (const [point, angle] of [
      [ring[1]!, -35 - 53.13 / 2],
      [ring[2]!, -35 + 53.13 / 2],
    ] as const) {
      expect(Math.hypot(point.along, point.z - from.z)).toBeCloseTo(reach, 9);
      expect(angleOf(point)).toBeCloseTo(angle, 9);
    }
  });

  test("a wall and a flat cone stand in a band from the origin up, out to the length", () => {
    const band = (length: number, height: number) => [
      { along: 0, z: 2.5 },
      { along: length, z: 2.5 },
      { along: length, z: 2.5 + height },
      { along: 0, z: 2.5 + height },
    ];
    expect(viewOf(rect({ yaw: 0 }), from).area).toEqual(band(30, 20));
    expect(viewOf(cone({ form: "flat", height: 5, pitch: -35 }), from).area).toEqual(band(40, 5));
  });

  test("a beam is the band about its tilted line, where its box and its tube are the same", () => {
    const bolt = rect({ form: "beam", yaw: 180, pitch: -15, length: 100, width: 5, height: 5 });
    const origin = at(22.5, 12.5, 12.5);
    const [nearLow, farLow, farHigh, nearHigh] = viewOf(bolt, origin).area;
    const middle = (a: { along: number; z: number }, b: { along: number; z: number }) => ({
      along: (a.along + b.along) / 2,
      z: (a.z + b.z) / 2,
    });
    // The two ends stand about the line, five feet across, square to it.
    const near = middle(nearLow!, nearHigh!);
    const far = middle(farLow!, farHigh!);
    expect(near.along).toBeCloseTo(0, 9);
    expect(near.z).toBeCloseTo(12.5, 9);
    expect(far.along).toBeCloseTo(100 * Math.cos(radians(15)), 9);
    expect(far.z).toBeCloseTo(12.5 - 100 * Math.sin(radians(15)), 9);
    expect(Math.hypot(nearHigh!.along - nearLow!.along, nearHigh!.z - nearLow!.z)).toBeCloseTo(
      5,
      9
    );
    expect(
      (nearHigh!.along - nearLow!.along) * (far.along - near.along) +
        (nearHigh!.z - nearLow!.z) * (far.z - near.z)
    ).toBeCloseTo(0, 6);
    // Along its line on the plan the box it catches with and the tube it
    // is drawn as reach the same top.
    for (let out = 1; out < 95; out += 7) {
      const plan = { x: origin.x, y: origin.y + out };
      expect(heldSpan(bolt, origin, plan)?.hi).toBeCloseTo(surface(bolt, origin, plan) ?? NaN, 9);
    }
  });
});

describe("the stretch an area holds over a point of the plan", () => {
  const origin = at(0, 0, 10);
  const forms: Area[] = [
    cone({ yaw: 90, length: 30 }),
    cone({ yaw: 37, pitch: -35, length: 30 }),
    cone({ yaw: 200, pitch: 60, length: 30, edge: "flat" }),
    cone({ yaw: 90, form: "flat", height: 5 }),
    rect({ yaw: 37 }),
    rect({ yaw: 37, form: "beam", pitch: -30, width: 10, height: 15 }),
    rect({ yaw: 200, form: "beam", pitch: 75, length: 10, width: 5, height: 40 }),
  ];

  test("is held just inside both ends and not just outside, and where there is none nothing is", () => {
    const strays: string[] = [];
    for (const area of forms) {
      if (area.kind === "circle") {
        continue;
      }
      for (let x = -40.013; x <= 40; x += 2.3) {
        for (let y = -40.029; y <= 40; y += 2.3) {
          const span = heldSpan(area, origin, { x, y });
          const heldAt = (z: number) => holds(area, origin, at(x, y, origin.z + z));
          if (span === undefined) {
            if ([-30, -10, 0, 1, 10, 30].some(heldAt)) {
              strays.push(`${area.kind} holds something over ${x}, ${y} with no stretch`);
            }
            continue;
          }
          const lean = Math.min(1e-6, (span.hi - span.lo) / 4);
          if (!heldAt(span.lo + lean) || !heldAt(span.hi - lean)) {
            strays.push(`${area.kind} misses inside its stretch over ${x}, ${y}`);
          }
          if (heldAt(span.lo - 1e-6) || heldAt(span.hi + 1e-6)) {
            strays.push(`${area.kind} holds outside its stretch over ${x}, ${y}`);
          }
        }
      }
    }
    expect(strays).toEqual([]);
  });
});

describe("the tokens in a side view", () => {
  // A token thirty feet up over the west wing's floor at (4, 10), breathing
  // north toward the dais, pitched down 35, as round four's dragon does.
  const dragon = onHouse("D", 4, 10, 30);
  const breathFrom = at(22.5, 52.5, 32.5);
  const breath = cone({ pitch: -35, length: 60, spread: 53 });

  test("stand at their distance along the yaw, their cubes at the ground and their own height", () => {
    const view = viewOf(breath, breathFrom, [
      dragon,
      onHouse("C", 4, 4),
      onHouse("E", 4, 1),
      onHouse("F", 1, 6, 15),
    ]);
    const placed = (id: string) => {
      const token = tokenIn(view, id);
      return [token.along, token.z];
    };
    // Laid from no token, the dragon is one more token, at the origin.
    expect(placed("D")).toEqual([0, 30]);
    expect(placed("C")).toEqual([30, 0]);
    expect(placed("E")).toEqual([45, 10]);
    expect(placed("F")).toEqual([20, 15]);
  });

  test("the token it is laid from stands at the origin as its source, and no line names it", () => {
    const tokens = [dragon, onHouse("C", 4, 4), onHouse("B", 4, 9)];
    const view = viewOf(breath, breathFrom, tokens, house, "D");
    expect(view.source).toEqual({ id: "D", label: "D", along: 0, z: 30 });
    expect(view.tokens.map((token) => token.id)).not.toContain("D");
    expect(tokenIn(view, "C").verdict.kind).toBe("caught");
    // B, under the dragon on the floor, is named as it was.
    expect(tokenIn(view, "B").verdict.kind).not.toBe("caught");
    // Laid from no token, there is no source, and the dragon is judged.
    expect(viewOf(breath, breathFrom, tokens).source).toBeUndefined();
  });

  test("caught, a token's verdict says how far out it is and what it stands on", () => {
    const view = viewOf(breath, breathFrom, [onHouse("C", 4, 4), onHouse("E", 4, 1)]);
    expect(tokenIn(view, "C").verdict).toEqual({
      kind: "caught",
      out: 30,
      ground: 0,
      elevation: 0,
    });
    expect(tokenIn(view, "E").verdict).toEqual({
      kind: "caught",
      out: 45,
      ground: 10,
      elevation: 0,
    });
  });

  test("the caught come first, then the clear, each nearest first", () => {
    const view = viewOf(cone({ length: 20 }), at(22.5, 52.5, 2.5), [
      onHouse("S", 4, 11),
      onHouse("R", 6, 8),
      onHouse("P", 4, 6),
      onHouse("Q", 4, 5),
      onHouse("N", 4, 8),
    ]);
    expect(view.tokens.map((token) => token.id)).toEqual(["N", "P", "S", "R", "Q"]);
  });

  test("off the footprint, it is beside the area, past its end or behind its start", () => {
    // North from (4, 10), twenty feet: the cone ends on row 6.
    const view = viewOf(cone({ length: 20 }), at(22.5, 52.5, 2.5), [
      onHouse("Q", 4, 5),
      onHouse("R", 6, 8),
      onHouse("S", 4, 11),
    ]);
    expect(tokenIn(view, "Q").verdict).toEqual({ kind: "off", side: "past" });
    expect(tokenIn(view, "R").verdict).toEqual({ kind: "off", side: "beside" });
    expect(tokenIn(view, "S").verdict).toEqual({ kind: "off", side: "behind" });
  });

  test("a token far from the area is not named at all", () => {
    const view = viewOf(cone({ length: 20 }), at(22.5, 52.5, 2.5), [onHouse("far", 15, 3)]);
    expect(view.tokens).toEqual([]);
  });

  test("a beam passes over a token beneath its high end, by the gap from its head to its underside", () => {
    // From the dais's front edge, a bolt a hundred feet by five by five
    // south down the west wing, pitched down 15: ten feet out its underside
    // is above the cube of a token on the floor.
    const bolt = rect({ form: "beam", yaw: 180, pitch: -15, length: 100, width: 5, height: 5 });
    const view = viewOf(bolt, at(22.5, 12.5, 12.5), [onHouse("b", 4, 4), onHouse("c", 4, 9)]);
    const underside = 12.5 - (2.5 + 10 * Math.sin(radians(15))) / Math.cos(radians(15));
    const verdict = tokenIn(view, "b").verdict;
    expect(verdict.kind).toBe("over");
    expect(verdict.kind === "over" && verdict.gap).toBeCloseTo(underside - 5, 9);
    expect(tokenIn(view, "c").verdict.kind).toBe("caught");
  });

  test("a wall of fire passes under a flier above it, by the gap from its top to the flier's feet", () => {
    const view = viewOf(rect(), at(22.5, 32.5, 2.5), [onHouse("X", 6, 6), onHouse("Y", 6, 6, 30)]);
    expect(tokenIn(view, "X").verdict.kind).toBe("caught");
    expect(tokenIn(view, "Y").verdict).toEqual({ kind: "under", gap: 30 - 22.5 });
  });

  test("held but cut off, it names the wall, the shut door or the ground that stops the line", () => {
    // A cone breathed down the hall from its west end: a token beyond the
    // north wall is held but hidden, one on the gallery is caught.
    const hall = viewOf(cone({ yaw: 90, length: 90, spread: 53 }), at(12.5, 62.5, 2.5), [
      onHouse("W", 12, 11),
      onHouse("G", 12, 12),
    ]);
    expect(tokenIn(hall, "W").verdict).toEqual({
      kind: "hidden",
      by: "wall",
      height: 10,
      at: { along: 25, z: 2.5 },
    });
    expect(tokenIn(hall, "G").verdict.kind).toBe("caught");
    // North through the east wing's shut door.
    const door = viewOf(cone({ length: 30 }), at(77.5, 42.5, 2.5), [onHouse("N", 15, 5)]);
    const shut = tokenIn(door, "N").verdict;
    expect(shut.kind === "hidden" && [shut.by, shut.height]).toEqual(["door", 10]);
    // A bolt pitched down into the floor before the pit: the floor stops
    // the line to a token down in it.
    const bolt = rect({ form: "beam", pitch: -30, length: 100, width: 5, height: 5 });
    const pit = viewOf(bolt, at(57.5, 47.5, 2.5), [onHouse("p", 14, 9)]);
    const floor = tokenIn(pit, "p").verdict;
    expect(floor.kind === "hidden" && [floor.by, floor.height]).toEqual(["ground", 0]);
    expect(holds(bolt, at(57.5, 47.5, 2.5), at(72.5, 47.5, -7.5))).toBe(true);
  });

  test("a secret door is named to the DM's seat and stands as the wall it hides in to a player's", () => {
    // From the east wing's floor at (16, 9), south to a token on the
    // gallery behind the secret door on (16, 11), as each seat's own
    // topology has it.
    const forPlayer = derive(visibleTo(mansionStrokes(), "party"), bounds);
    const origin = at(82.5, 47.5, 2.5);
    const reason = (topology: Topology) => {
      const verdict = tokenIn(
        viewOf(cone({ yaw: 180, length: 30 }), origin, [standing(topology)("H", 16, 12)], topology),
        "H"
      ).verdict;
      return verdict.kind === "hidden" ? verdict.by : verdict.kind;
    };
    expect(reason(house)).toBe("secret");
    expect(reason(forPlayer)).toBe("wall");
  });
});

describe("a cone that climbs onto the dais", () => {
  // From the floor at (4, 6), twenty feet short of the dais's lip, a 60 ft
  // cone pitched up 20: its side strikes the face and its top spills over
  // the lip.
  const origin = at(22.5, 32.5, 2.5);
  const area = cone({ pitch: 20, length: 60 });
  const edge = onHouse("A", 4, 2);
  const back = onHouse("B", 4, 1);
  const view = viewOf(area, origin, [edge, back]);

  test("catches who stands at the edge, and the lip hides who stands further back", () => {
    expect(catchesToken(area, origin, edge, house, rule)).toBe(true);
    expect(tokenIn(view, "A").verdict).toEqual({
      kind: "caught",
      out: 20,
      ground: 10,
      elevation: 0,
    });
    // The cone holds the one further back; the line to the middle of its
    // cube is under the lip where it crosses it.
    expect(holds(area, origin, at(22.5, 7.5, 12.5))).toBe(true);
    const hidden = tokenIn(view, "B").verdict;
    expect(hidden.kind).toBe("hidden");
    if (hidden.kind === "hidden") {
      expect(hidden.by).toBe("ground");
      expect(hidden.height).toBe(10);
      expect(hidden.at.along).toBeCloseTo(17.5, 9);
      expect(hidden.at.z).toBeLessThan(10);
    }
  });

  test("lands on the floor and onto the dais, and stops short of where the lip hides it", () => {
    expect(view.lands).toHaveLength(1);
    const [stretch] = view.lands;
    const first = stretch![0]!;
    const last = stretch![stretch!.length - 1]!;
    expect(first.z).toBe(0);
    expect(last.z).toBe(10);
    expect(last.along).toBeGreaterThan(tokenIn(view, "A").along);
    expect(last.along).toBeLessThan(tokenIn(view, "B").along);
  });
});

describe("what the side view says against what the board catches", () => {
  // A token on every cell of the mansion, a flier among them.
  const everyone: TokenView[] = [];
  for (let row = 0; row < bounds.rows; row += 1) {
    for (let col = 0; col < bounds.cols; col += 1) {
      everyone.push(onHouse(`${col},${row}`, col, row, (col * 7 + row * 3) % 11 === 0 ? 20 : 0));
    }
  }
  const cases: [string, Area, Spot][] = [
    ["a cone down the hall", cone({ yaw: 90, length: 90, spread: 53 }), at(12.5, 62.5, 2.5)],
    ["the dragon's breath", cone({ pitch: -35, length: 60, spread: 53 }), at(22.5, 52.5, 32.5)],
    ["a cone climbing the dais", cone({ pitch: 20, length: 60 }), at(22.5, 32.5, 2.5)],
    [
      "a flat-edged cone spreading",
      cone({ yaw: 135, edge: "flat", reaches: "around-corners" }),
      at(62.5, 17.5, 2.5),
    ],
    ["a flat cone", cone({ yaw: 250, form: "flat", height: 10 }), at(72.5, 42.5, 2.5)],
    ["a wall of fire", rect({ yaw: 45, length: 40 }), at(27.5, 27.5, 2.5)],
    [
      "a bolt from the dais",
      rect({ form: "beam", yaw: 180, pitch: -15, length: 100, width: 5, height: 5 }),
      at(22.5, 12.5, 12.5),
    ],
    [
      "a bolt into the pit",
      rect({ form: "beam", pitch: -30, length: 100, width: 5, height: 5 }),
      at(57.5, 47.5, 2.5),
    ],
  ];

  test("says caught of exactly the tokens the board catches, over every template", () => {
    for (const [name, area, origin] of cases) {
      const view = viewOf(area, origin, everyone);
      const said = view.tokens
        .filter((token) => token.verdict.kind === "caught")
        .map((token) => token.id)
        .sort();
      const board = everyone
        .filter((token) => catchesToken(area, origin, token, house, rule))
        .map((token) => token.id)
        .sort();
      expect({ name, said }).toEqual({ name, said: board });
      expect(board.length).toBeGreaterThan(0);
    }
  });

  test("laid from the token on its origin's cell, both leave that token out and agree on the rest", () => {
    for (const [name, area, origin] of cases) {
      const source = `${Math.floor(origin.x / rule.cellSize)},${Math.floor(origin.y / rule.cellSize)}`;
      const view = viewOf(area, origin, everyone, house, source);
      const said = view.tokens
        .filter((token) => token.verdict.kind === "caught")
        .map((token) => token.id)
        .sort();
      const board = everyone
        .filter((token) => catchesToken(area, origin, token, house, rule, source))
        .map((token) => token.id)
        .sort();
      expect({ name, said }).toEqual({ name, said: board });
      expect(board).not.toContain(source);
      expect(view.source?.id).toBe(source);
      expect(view.tokens.some((token) => token.id === source)).toBe(false);
    }
  });

  test("lands over exactly the cells the board lights, where the slice crosses them", () => {
    for (const [name, area, origin] of cases) {
      if (area.kind === "circle") {
        continue;
      }
      const view = viewOf(area, origin);
      const lit = new Set(
        caughtCells(area, origin, house, rule).map((cell) => `${cell.col}:${cell.row}`)
      );
      const way = { x: Math.sin(radians(area.yaw)), y: -Math.cos(radians(area.yaw)) };
      const strays: number[] = [];
      for (let along = view.from + 0.011; along < view.to; along += 0.37) {
        const col = Math.floor((origin.x + way.x * along) / rule.cellSize);
        const row = Math.floor((origin.y + way.y * along) / rule.cellSize);
        const isLanded = view.lands.some(
          (stretch) =>
            along >= (stretch[0]?.along ?? Infinity) &&
            along <= (stretch[stretch.length - 1]?.along ?? -Infinity)
        );
        if (isLanded !== lit.has(`${col}:${row}`)) {
          strays.push(along);
        }
      }
      expect({ name, strays }).toEqual({ name, strays: [] });
    }
  });

  test("a circle faces no way and has no side view", () => {
    const circle: Area = {
      kind: "circle",
      reaches: "line-of-sight",
      radius: 20,
      inner: 0,
      form: "sphere",
      height: 20,
    };
    expect(sideViewOf(circle, at(22.5, 32.5, 2.5), house, everyone, rule)).toBeUndefined();
  });
});
