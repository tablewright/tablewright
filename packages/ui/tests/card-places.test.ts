import { describe, expect, test } from "bun:test";
import {
  placeCards,
  type CardToPlace,
  type PlacedCard,
  type ScreenBox,
} from "../src/components/templates/places.js";

const screen = { width: 1600, height: 900 };

// A card the size the app draws one, for a token whose drawing reaches
// 20 px from its centre.
const card = (id: string, x: number, y: number): CardToPlace => ({
  id,
  anchor: { x, y, reach: 20 },
  width: 280,
  height: 200,
});

const overlaps = (a: ScreenBox, b: ScreenBox): boolean =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

const covers = (box: ScreenBox, x: number, y: number, reach: number): boolean =>
  overlaps(box, { left: x - reach, top: y - reach, width: reach * 2, height: reach * 2 });

const boxOf = (placed: readonly PlacedCard[], id: string): ScreenBox => {
  const found = placed.find((one) => one.id === id);
  if (found === undefined) {
    throw new Error(`${id} was not placed`);
  }
  return found.box;
};

describe("where a card sits", () => {
  test("right of its token and clear of it, with a line from the token's edge to the card's side", () => {
    const [one] = placeCards([card("A", 400, 300)], screen);
    expect(one?.box).toEqual({ left: 434, top: 200, width: 280, height: 200 });
    expect(one?.line).toEqual({ from: { x: 420, y: 300 }, to: { x: 434, y: 300 } });
  });

  test("a token near the right edge has its card on its left", () => {
    const [one] = placeCards([card("A", 1500, 300)], screen);
    expect(one?.box.left).toBe(1500 - 20 - 14 - 280);
  });

  test("a second card whose spot the first holds steps aside rather than covering it", () => {
    const placed = placeCards([card("A", 400, 300), card("B", 400, 360)], screen);
    expect(overlaps(boxOf(placed, "A"), boxOf(placed, "B"))).toBe(false);
    expect(covers(boxOf(placed, "B"), 400, 360, 20)).toBe(false);
  });

  test("a card keeps off another card's token", () => {
    const placed = placeCards([card("A", 400, 300), card("B", 600, 300)], screen);
    expect(covers(boxOf(placed, "A"), 600, 300, 20)).toBe(false);
    expect(covers(boxOf(placed, "B"), 400, 300, 20)).toBe(false);
  });

  test("five cards round one corner of the board stay apart and on the screen", () => {
    const placed = placeCards(
      [
        card("A", 1500, 820),
        card("B", 1540, 860),
        card("C", 1460, 860),
        card("D", 1500, 760),
        card("E", 1420, 800),
      ],
      screen
    );
    for (const one of placed) {
      expect(one.box.left).toBeGreaterThanOrEqual(8);
      expect(one.box.top).toBeGreaterThanOrEqual(8);
      expect(one.box.left + one.box.width).toBeLessThanOrEqual(screen.width - 8);
      expect(one.box.top + one.box.height).toBeLessThanOrEqual(screen.height - 8);
      for (const other of placed) {
        if (other !== one) {
          expect(overlaps(one.box, other.box)).toBe(false);
        }
      }
    }
  });

  test("with nowhere free, every card is still placed beside its token", () => {
    const small = { width: 320, height: 240 };
    const placed = placeCards([card("A", 100, 100), card("B", 200, 150)], small);
    expect(placed.map((one) => one.id)).toEqual(["A", "B"]);
  });

  test("a token panned off the screen keeps its card at the edge, the line running toward it", () => {
    const [one] = placeCards([card("A", -200, 300)], screen);
    expect(one?.box.left).toBe(8);
    expect(one?.line?.to).toEqual({ x: 8, y: 300 });
    expect(one?.line?.from.x).toBeLessThan(0);
  });

  test("a card that covers its token's edge has no line", () => {
    const tiny = { width: 300, height: 220 };
    const [one] = placeCards([card("A", 150, 110)], tiny);
    expect(one?.line).toBeUndefined();
  });
});
