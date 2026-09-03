import { describe, expect, test } from "bun:test";
import { categoryOf, groupHits, previewOf } from "../src/spotlight/preview.js";
import type { SpotlightHit } from "../src/spotlight/searcher.js";

function hit(type: string, name: string, tags: string[]): SpotlightHit {
  return { id: `t:${type}:${name}`, type, name, source: "test", tags };
}

describe("categoryOf", () => {
  test("maps the system's kinds onto the three categories", () => {
    expect(categoryOf("spell")).toBe("Spells");
    expect(categoryOf("monster")).toBe("Bestiary");
    expect(categoryOf("item")).toBe("Items");
    expect(categoryOf("magic-item")).toBe("Items");
  });

  test("an unknown kind groups by itself, made readable", () => {
    expect(categoryOf("lore-note")).toBe("Lore Note");
  });
});

describe("previewOf", () => {
  test("a spell shows its level as a ring and the rest as its line", () => {
    const cantrip = previewOf(hit("spell", "Fire Bolt", ["evocation", "cantrip", "wizard"]));
    expect(cantrip).toEqual({ category: "Spells", meta: "evocation · wizard", ring: "C" });
    const third = previewOf(hit("spell", "Fireball", ["evocation", "level-3"]));
    expect(third.ring).toBe("3");
  });

  test("a creature shows its challenge as a badge", () => {
    const goblin = previewOf(hit("monster", "Goblin", ["fey", "small", "cr-1/4"]));
    expect(goblin).toEqual({ category: "Bestiary", meta: "fey · small", badge: "CR 1/4" });
  });

  test("an item shows its rarity as a badge when it has one", () => {
    const sword = previewOf(hit("magic-item", "Flame Tongue", ["weapon", "rare", "attunement"]));
    expect(sword).toEqual({ category: "Items", meta: "weapon · attunement", badge: "Rare" });
    const gear = previewOf(hit("item", "Rope", ["adventuring-gear"]));
    expect(gear.badge).toBeUndefined();
  });

  test("with no tags the line falls back to the source", () => {
    expect(previewOf(hit("monster", "Owl", [])).meta).toBe("test");
  });
});

describe("groupHits", () => {
  test("groups follow their best hit and keep rank order inside", () => {
    const groups = groupHits([
      hit("spell", "Fire Bolt", []),
      hit("monster", "Fire Elemental", []),
      hit("spell", "Fireball", []),
      hit("magic-item", "Flame Tongue", []),
      hit("item", "Alchemist's Fire", []),
    ]);
    expect(groups.map((group) => group.category)).toEqual(["Spells", "Bestiary", "Items"]);
    expect(groups[0]?.hits.map((entry) => entry.name)).toEqual(["Fire Bolt", "Fireball"]);
    expect(groups[2]?.hits.map((entry) => entry.name)).toEqual([
      "Flame Tongue",
      "Alchemist's Fire",
    ]);
  });

  test("no hits means no groups", () => {
    expect(groupHits([])).toEqual([]);
  });
});
