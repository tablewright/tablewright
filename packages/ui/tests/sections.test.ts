import { describe, expect, test } from "bun:test";
import { groups } from "../src/entry/sections.js";

describe("groups", () => {
  test("consecutive labels share a heading and order is kept", () => {
    const grouped = groups([
      { label: "Traits", name: "Pack Tactics", note: "", html: "<p>a</p>" },
      { label: "Actions", name: "Multiattack", note: "", html: "<p>b</p>" },
      { label: "Actions", name: "Scimitar", note: "", html: "<p>c</p>" },
      { label: "Legendary actions", name: "Pounce", note: "Level 3", html: "" },
    ]);
    expect(grouped.map((group) => [group.label, group.items.map((item) => item.name)])).toEqual([
      ["Traits", ["Pack Tactics"]],
      ["Actions", ["Multiattack", "Scimitar"]],
      ["Legendary actions", ["Pounce"]],
    ]);
  });

  test("nothing groups to nothing", () => {
    expect(groups([])).toEqual([]);
  });
});
