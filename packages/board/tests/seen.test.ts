import { describe, expect, test } from "bun:test";
import { SEEN_BY, seenByNote, seesIt } from "../src/index.js";

// Whether the thing is the viewer's own; the board works it out from the
// view it was made in and whether this page is looking through its own eyes.
const MINE = true;
const THEIRS = false;

describe("who sees a measure or an area", () => {
  test("everyone means everyone at the table, whoever made it", () => {
    expect(seesIt("party", THEIRS, "party")).toBe(true);
    expect(seesIt("party", THEIRS, "dm")).toBe(true);
    expect(seesIt("party", MINE, "party")).toBe(true);
  });

  test("the DM's own reaches the DM and nobody at the table", () => {
    expect(seesIt("dm", THEIRS, "dm")).toBe(true);
    expect(seesIt("dm", THEIRS, "party")).toBe(false);
  });

  test("a player who sends one to the DM keeps sight of it", () => {
    expect(seesIt("dm", MINE, "party")).toBe(true);
    // And it reaches the DM, who did not make it.
    expect(seesIt("dm", THEIRS, "dm")).toBe(true);
  });

  test("one's own is nobody else's", () => {
    expect(seesIt("own", MINE, "dm")).toBe(true);
    expect(seesIt("own", MINE, "party")).toBe(true);
    expect(seesIt("own", THEIRS, "dm")).toBe(false);
    expect(seesIt("own", THEIRS, "party")).toBe(false);
  });

  test("a viewer below the table sees only what is open to the world", () => {
    // Nothing is made at world tier, so the outsider sees none of it.
    expect(seesIt("party", THEIRS, "world")).toBe(false);
    expect(seesIt("dm", THEIRS, "world")).toBe(false);
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
