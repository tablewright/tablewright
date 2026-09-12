import { describe, expect, test } from "bun:test";
import { categoryOf, groupHits, previewOf } from "../src/spotlight/preview.js";
import type { Taxonomy } from "../src/spotlight/preview.js";
import type { SpotlightHit } from "../src/spotlight/searcher.js";

// What a 5e manifest hands the box: kind to category label.
const TAXONOMY: Taxonomy = {
  spell: "Spells",
  monster: "Bestiary",
  item: "Items",
  "magic-item": "Items",
};

function hit(type: string, name: string, tags: string[]): SpotlightHit {
  return { id: `t:${type}:${name}`, type, name, source: "test", tags };
}

describe("categoryOf", () => {
  test("follows the taxonomy the system manifest declares", () => {
    expect(categoryOf("spell", TAXONOMY)).toBe("Spells");
    expect(categoryOf("monster", TAXONOMY)).toBe("Bestiary");
    expect(categoryOf("item", TAXONOMY)).toBe("Items");
    expect(categoryOf("magic-item", TAXONOMY)).toBe("Items");
  });

  test("a kind the taxonomy omits groups by itself, made readable", () => {
    expect(categoryOf("lore-note", TAXONOMY)).toBe("Lore Note");
    expect(categoryOf("spell")).toBe("Spell");
  });
});

describe("previewOf", () => {
  test("a spell shows its level as a ring and the rest as its line", () => {
    const cantrip = previewOf(
      hit("spell", "Fire Bolt", ["evocation", "cantrip", "wizard"]),
      TAXONOMY
    );
    expect(cantrip).toEqual({ category: "Spells", meta: "evocation, wizard", ring: "C" });
    const third = previewOf(hit("spell", "Fireball", ["evocation", "level-3"]), TAXONOMY);
    expect(third.ring).toBe("3");
  });

  test("a creature shows its challenge as a badge", () => {
    const goblin = previewOf(hit("monster", "Goblin", ["fey", "small", "cr-1/4"]), TAXONOMY);
    expect(goblin).toEqual({ category: "Bestiary", meta: "fey, small", badge: "CR 1/4" });
  });

  test("an item shows its rarity as a badge when it has one", () => {
    const sword = previewOf(
      hit("magic-item", "Flame Tongue", ["weapon", "rare", "attunement"]),
      TAXONOMY
    );
    expect(sword).toEqual({ category: "Items", meta: "weapon, attunement", badge: "Rare" });
    const gear = previewOf(hit("item", "Rope", ["adventuring-gear"]), TAXONOMY);
    expect(gear.badge).toBeUndefined();
  });

  test("a hit found by a part leads with the part", () => {
    const goblin = {
      ...hit("monster", "Goblin", ["fey", "small"]),
      part: { label: "Trait", name: "Pack Tactics" },
    };
    expect(previewOf(goblin, TAXONOMY).meta).toBe("Pack Tactics, fey, small");
    expect(previewOf({ ...goblin, part: null }, TAXONOMY).meta).toBe("fey, small");
  });

  test("with no tags the line falls back to the source", () => {
    expect(previewOf(hit("monster", "Owl", []), TAXONOMY).meta).toBe("test");
  });
});

describe("groupHits", () => {
  test("groups follow their best hit and keep rank order inside", () => {
    const groups = groupHits(
      [
        hit("spell", "Fire Bolt", []),
        hit("monster", "Fire Elemental", []),
        hit("spell", "Fireball", []),
        hit("magic-item", "Flame Tongue", []),
        hit("item", "Alchemist's Fire", []),
      ],
      TAXONOMY
    );
    expect(groups.map((group) => group.category)).toEqual(["Spells", "Bestiary", "Items"]);
    expect(groups[0]?.hits.map((entry) => entry.name)).toEqual(["Fire Bolt", "Fireball"]);
    expect(groups[2]?.hits.map((entry) => entry.name)).toEqual([
      "Flame Tongue",
      "Alchemist's Fire",
    ]);
  });

  test("without a taxonomy every kind is its own group", () => {
    const groups = groupHits([hit("item", "Rope", []), hit("magic-item", "Flame Tongue", [])]);
    expect(groups.map((group) => group.category)).toEqual(["Item", "Magic Item"]);
  });

  test("no hits means no groups", () => {
    expect(groupHits([], TAXONOMY)).toEqual([]);
  });
});
