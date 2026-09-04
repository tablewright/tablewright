// A stand-in for the system manifest when the page runs without Tauri:
// the categories and kinds of 5e, and enough controls per category to
// drive the tray under Playwright. The real manifest is systems/5e/
// system.json, handed over by the core's `system` command.

import type { SystemManifest } from "@tablewright/schema";

export const fixtureSystem: SystemManifest = {
  id: "5e",
  name: "5e",
  versions: { "2014": { name: "5e (2014 rules)" }, "2024": { name: "5e (2024 rules)" } },
  categories: { spells: "Spells", bestiary: "Bestiary", items: "Items" },
  kinds: {
    spell: { name: "Spell", category: "spells", words: ["spell", "spells"] },
    monster: {
      name: "Creature",
      category: "bestiary",
      words: ["creature", "creatures"],
      // The bestiary is DM material, as in the shipped manifest.
      visibility: "dm",
      data_visibility: "dm",
    },
    item: { name: "Item", category: "items", words: ["item", "items"] },
    "magic-item": { name: "Magic item", category: "items", words: ["magic item"] },
  },
  facets: {},
  controls: {
    spell: [
      {
        control: "rail",
        label: "Level",
        facet: "level",
        stops: [
          { value: 0, label: "Cantrip" },
          { value: 1, label: null },
          { value: 2, label: null },
          { value: 3, label: null },
          { value: 4, label: null },
          { value: 5, label: null },
        ],
        cells: [],
        beside: null,
      },
      { control: "chips", label: "School", facet: "school", stops: [], cells: [], beside: null },
      {
        control: "switch",
        label: "Casting",
        facet: null,
        stops: [],
        cells: [
          [
            { facet: "ritual", value: true, label: "Ritual" },
            { facet: "concentration", value: true, label: "Concentration" },
          ],
        ],
        beside: null,
      },
    ],
    monster: [
      {
        control: "slider",
        label: "Challenge rating",
        facet: "cr",
        stops: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => ({ value, label: null })),
        cells: [],
        beside: null,
      },
      {
        control: "rail",
        label: "Size",
        facet: "size",
        stops: [
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
          { value: "huge", label: "Huge" },
        ],
        cells: [],
        beside: null,
      },
    ],
    "magic-item": [
      {
        control: "rail",
        label: "Rarity",
        facet: "rarity",
        stops: [
          { value: "common", label: "Common" },
          { value: "uncommon", label: "Uncommon" },
          { value: "rare", label: "Rare" },
          { value: "very-rare", label: "Very rare" },
        ],
        cells: [],
        beside: null,
      },
      {
        control: "select",
        label: "Duration",
        facet: "duration",
        stops: [
          { value: "instantaneous", label: "Instantaneous" },
          { value: "1 minute", label: "1 minute" },
        ],
        cells: [],
        beside: null,
      },
    ],
  },
};

/** The text values the fixture entries hold, per facet. */
export const fixtureFacetValues: Record<string, string[]> = {
  school: ["evocation", "abjuration"],
  size: ["large"],
  rarity: ["rare"],
};
