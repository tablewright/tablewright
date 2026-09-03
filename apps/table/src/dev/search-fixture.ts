// A stand-in for the core when the page runs without Tauri, as it does
// under Vite and Playwright: a few entries with bodies, the simplest
// ranking (name matches first, then tags, then type), and a lookup by id.
// Enough to drive the panel, the share cards, and the entry page.

import type {
  EntryDocument,
  SearchAnswer,
  Searcher,
  SpotlightHit,
  Taxonomy,
} from "@tablewright/ui";

const ENTRIES: EntryDocument[] = [
  {
    id: "fx:spell:fire-bolt",
    type: "spell",
    name: "Fire Bolt",
    source: "fixture",
    tags: ["evocation", "cantrip"],
    body: "You hurl a mote of fire at a creature or an object within range.\n\n**Cantrip Upgrade.** The damage increases by 1d10 at levels 5, 11, and 17.",
  },
  {
    id: "fx:spell:fireball",
    type: "spell",
    name: "Fireball",
    source: "fixture",
    tags: ["evocation", "level-3"],
    body: "A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion.",
  },
  {
    id: "fx:spell:wall-of-fire",
    type: "spell",
    name: "Wall of Fire",
    source: "fixture",
    tags: ["evocation", "level-4"],
    body: "You create a wall of fire on a solid surface within range.",
  },
  {
    id: "fx:monster:fire-elemental",
    type: "monster",
    name: "Fire Elemental",
    source: "fixture",
    tags: ["elemental", "large", "cr-5"],
    body: "",
  },
  {
    id: "fx:monster:goblin-warrior",
    type: "monster",
    name: "Goblin Warrior",
    source: "fixture",
    tags: ["fey", "small", "cr-1/4"],
    body: "",
  },
  {
    id: "fx:item:longsword",
    type: "item",
    name: "Longsword",
    source: "fixture",
    tags: ["weapon"],
    body: "A longsword.",
  },
  {
    id: "fx:magic-item:flame-tongue",
    type: "magic-item",
    name: "Flame Tongue",
    source: "fixture",
    tags: ["weapon", "fire", "rare", "attunement"],
    body: "While holding this magic weapon, you can take a Bonus Action to cause flames to sheathe its blade.",
  },
];

export const fixtureSearcher: Searcher = async (query: string): Promise<SearchAnswer> => {
  const started = performance.now();
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== "");
  const scored = ENTRIES.flatMap((entry) => {
    let score = 0;
    for (const token of tokens) {
      const [field, value] = token.split(":");
      if (field === "type" && value !== undefined) {
        if (entry.type !== value) {
          return [];
        }
        continue;
      }
      const name = entry.name.toLowerCase();
      if (name.startsWith(token)) {
        score += 0;
      } else if (name.includes(token)) {
        score += 1;
      } else if (entry.tags.some((tag) => tag.includes(token))) {
        score += 4;
      } else if (entry.type.includes(token)) {
        score += 8;
      } else {
        return [];
      }
    }
    return [{ entry, score }];
  });
  scored.sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name));
  return {
    hits: scored.map(({ entry }) => summaryOf(entry)),
    elapsedUs: Math.round((performance.now() - started) * 1000),
    catalogueSize: ENTRIES.length,
  };
};

/** The fixture's answer to `get_entry`. */
export function fixtureEntry(id: string): EntryDocument | undefined {
  return ENTRIES.find((entry) => entry.id === id);
}

function summaryOf(entry: EntryDocument): SpotlightHit {
  const { id, type, name, source, tags } = entry;
  return { id, type, name, source, tags };
}

/** What the 5e manifest declares: kind to category label. */
export const fixtureTaxonomy: Taxonomy = {
  spell: "Spells",
  monster: "Bestiary",
  item: "Items",
  "magic-item": "Items",
};
