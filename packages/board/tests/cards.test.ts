import { describe, expect, test } from "bun:test";
import type { Role, Visibility } from "@tablewright/schema";
import {
  CardDeck,
  DEFAULT_RULE,
  derive,
  isDealt,
  sideViewOf,
  type Area,
  type PlacedArea,
  type Seat,
  type SideView,
  type Spot,
  type TokenView,
} from "../src/index.js";

type Cone = Extract<Area, { kind: "cone" }>;

const rule = DEFAULT_RULE;
const open = derive([], { colMin: 0, rowMin: 0, cols: 20, rows: 15 });

const seat = (id: string, sees: Visibility, name = id): Seat => {
  const role: Role = { name, sees, permissions: ["ruler:use"] };
  return { id, role };
};
const dm = seat("dm", "dm", "The DM");
const player = seat("player", "party", "Player");
const spectator = seat("spectator", "party", "Spectator");

// A dragon's breath on open ground: a 40 ft cone aimed north from the
// middle of the cube on (4, 10), as the palette makes one.
const breath: Cone = {
  kind: "cone",
  reaches: "line-of-sight",
  yaw: 0,
  pitch: 0,
  length: 40,
  spread: 53.13,
  edge: "round",
  form: "3d",
  height: 5,
};
const origin: Spot = { x: 22.5, y: 52.5, z: 2.5 };

const token = (id: string, col: number, row: number): TokenView => ({
  id,
  label: id,
  cell: { col, row },
  facing: 0,
  height: 0,
});

// Two in the breath, 10 and 15 ft out; one across the map; the dragon it
// leaves from.
const caughtTwo = [token("A", 4, 7), token("B", 4, 8), token("Z", 15, 2), token("D", 4, 10)];

const laid = (over: Partial<PlacedArea> = {}): PlacedArea => ({
  area: breath,
  origin,
  seenBy: "party",
  madeBy: "dm",
  source: "D",
  isPlaced: true,
  laying: 1,
  ...over,
});

function viewOf(tokens: readonly TokenView[]): SideView {
  const view = sideViewOf(breath, origin, open, tokens, rule, "D");
  if (view === undefined) {
    throw new Error("a cone has a side view");
  }
  return view;
}

const ids = (view: SideView): string[] => view.tokens.map((one) => one.id);

describe("who is dealt a template's cards", () => {
  test("from a player's seat a breath that catches two tokens deals two cards, and the DM's seat none", () => {
    const view = viewOf(caughtTwo);
    expect(isDealt(laid(), player)).toBe(true);
    const cards = new CardDeck().deal(view, 1, player.id);
    expect(ids(cards)).toEqual(["B", "A"]);
    expect(cards.tokens.every((one) => one.verdict.kind === "caught")).toBe(true);
    expect(isDealt(laid(), dm)).toBe(false);
  });

  test("a spectator is dealt the same as a player while tokens have no owners", () => {
    expect(isDealt(laid(), spectator)).toBe(true);
  });

  test("the seat that laid it is dealt none, since it has the strip, even a player's", () => {
    expect(isDealt(laid({ madeBy: "player" }), player)).toBe(false);
    expect(isDealt(laid({ madeBy: "player" }), spectator)).toBe(true);
    expect(isDealt(laid({ madeBy: "player" }), dm)).toBe(false);
  });

  test("a template still under the hand deals nothing until it is let go of", () => {
    expect(isDealt(laid({ isPlaced: false }), player)).toBe(false);
  });

  test("the DM's seat is told by what its role sees, never by the role's name", () => {
    expect(isDealt(laid(), seat("gm", "dm", "Game master"))).toBe(false);
    expect(isDealt(laid(), seat("guest", "party", "The DM"))).toBe(true);
  });

  test("a token near and clear has a card after the caught ones, and the one it leaves from has none", () => {
    // Two cells east of the axis, 15 ft out: just off the side of the cone.
    const view = viewOf([...caughtTwo, token("C", 6, 7)]);
    const cards = new CardDeck().deal(view, 1, player.id);
    expect(ids(cards)).toEqual(["B", "A", "C"]);
    expect(cards.tokens[2]?.verdict.kind).toBe("off");
    expect(ids(cards)).not.toContain("D");
  });
});

describe("closing a template's cards", () => {
  test("Escape closes the newest first: the last the side view names, then the one before", () => {
    const view = viewOf([...caughtTwo, token("C", 6, 7)]);
    const deck = new CardDeck();
    const newest = (): string | undefined => deck.deal(view, 1, player.id).tokens.at(-1)?.id;
    const closed: (string | undefined)[] = [];
    for (let press = 0; press < 3; press += 1) {
      const id = newest();
      closed.push(id);
      if (id !== undefined) {
        deck.close(id, 1, player.id);
      }
    }
    expect(closed).toEqual(["C", "A", "B"]);
    expect(deck.deal(view, 1, player.id).tokens).toEqual([]);
  });

  test("a card closed in one seat stays closed there for that laying, and only there", () => {
    const view = viewOf(caughtTwo);
    const deck = new CardDeck();
    deck.close("A", 1, player.id);
    expect(ids(deck.deal(view, 1, player.id))).toEqual(["B"]);
    // Another seat sits down, and the player sits back down again.
    expect(ids(deck.deal(view, 1, spectator.id))).toEqual(["B", "A"]);
    expect(ids(deck.deal(view, 1, player.id))).toEqual(["B"]);
  });

  test("laying the template again opens every card again, in every seat", () => {
    const view = viewOf(caughtTwo);
    const deck = new CardDeck();
    deck.close("A", 1, player.id);
    deck.close("B", 1, spectator.id);
    expect(ids(deck.deal(view, 2, player.id))).toEqual(["B", "A"]);
    expect(ids(deck.deal(view, 2, spectator.id))).toEqual(["B", "A"]);
  });
});
