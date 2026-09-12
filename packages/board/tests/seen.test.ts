import { describe, expect, test } from "bun:test";
import type { Role, Visibility } from "@tablewright/schema";
import { SEEN_BY, allows, reachOf, seenByNote, seesIt } from "../src/index.js";

const role = (sees: Visibility, over: Partial<Role> = {}): Role => ({
  name: "Someone",
  sees,
  permissions: ["ruler:use"],
  ...over,
});

const dm = role("dm");
const player = role("party");

// Whether the thing is the viewer's own; the board works it out from the
// seat it was made in and the seat looking at it now.
const MINE = true;
const THEIRS = false;

describe("who sees a measure or an area", () => {
  test("everyone means everyone at the table, whoever made it", () => {
    expect(seesIt("party", THEIRS, player)).toBe(true);
    expect(seesIt("party", THEIRS, dm)).toBe(true);
    expect(seesIt("party", MINE, player)).toBe(true);
  });

  test("the DM's own reaches the DM and nobody at the table", () => {
    expect(seesIt("dm", THEIRS, dm)).toBe(true);
    expect(seesIt("dm", THEIRS, player)).toBe(false);
  });

  test("a player who sends one to the DM keeps sight of it", () => {
    expect(seesIt("dm", MINE, player)).toBe(true);
    expect(seesIt("dm", THEIRS, dm)).toBe(true);
  });

  test("one's own is nobody else's", () => {
    expect(seesIt("own", MINE, dm)).toBe(true);
    expect(seesIt("own", MINE, player)).toBe(true);
    expect(seesIt("own", THEIRS, dm)).toBe(false);
    expect(seesIt("own", THEIRS, player)).toBe(false);
  });

  test("a seat below the table sees only what is open to the world", () => {
    const outsider = role("world");
    expect(seesIt("party", THEIRS, outsider)).toBe(false);
    expect(seesIt("dm", THEIRS, outsider)).toBe(false);
  });

  test("the board says which, and says nothing for the table's own", () => {
    expect(seenByNote("party")).toBeUndefined();
    expect(seenByNote("dm")).toBe("DM only");
    expect(seenByNote("own")).toBe("Just you");
  });

  test("everyone is the first choice offered, so it is the default", () => {
    expect(SEEN_BY[0]).toBe("party");
    expect([...SEEN_BY]).toEqual(["party", "dm", "own"]);
  });
});

describe("what a role may do", () => {
  test("a permission the role does not hold is refused", () => {
    expect(allows(player, "ruler:use")).toBe(true);
    expect(allows(player, "ink:wall:draw")).toBe(false);
  });

  test("what is done is one's own until the file says wider", () => {
    expect(reachOf(player, "token:move")).toBe("own");
    const mover = role("dm", {
      permissions: ["token:move"],
      reach: { "token:move": "world" },
    });
    expect(reachOf(mover, "token:move")).toBe("world");
  });
});
