// A stand-in for the core's search when the page runs without Tauri, as it
// does under Vite and Playwright. A few entries and the simplest ranking:
// name matches first, then tags, then type; enough to drive the panel.

import type { SearchAnswer, Searcher, SpotlightHit } from "@tablewright/ui";

const ENTRIES: SpotlightHit[] = [
  {
    id: "fx:spell:fire-bolt",
    type: "spell",
    name: "Fire Bolt",
    source: "fixture",
    tags: ["evocation", "cantrip"],
  },
  {
    id: "fx:spell:fireball",
    type: "spell",
    name: "Fireball",
    source: "fixture",
    tags: ["evocation", "level-3"],
  },
  {
    id: "fx:spell:wall-of-fire",
    type: "spell",
    name: "Wall of Fire",
    source: "fixture",
    tags: ["evocation", "level-4"],
  },
  {
    id: "fx:monster:fire-elemental",
    type: "monster",
    name: "Fire Elemental",
    source: "fixture",
    tags: ["elemental", "large", "cr-5"],
  },
  {
    id: "fx:monster:goblin-warrior",
    type: "monster",
    name: "Goblin Warrior",
    source: "fixture",
    tags: ["fey", "small", "cr-1/4"],
  },
  { id: "fx:item:longsword", type: "item", name: "Longsword", source: "fixture", tags: ["weapon"] },
  {
    id: "fx:magic-item:flame-tongue",
    type: "magic-item",
    name: "Flame Tongue",
    source: "fixture",
    tags: ["weapon", "fire", "rare", "attunement"],
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
    hits: scored.map(({ entry }) => entry),
    elapsedUs: Math.round((performance.now() - started) * 1000),
    catalogueSize: ENTRIES.length,
  };
};
