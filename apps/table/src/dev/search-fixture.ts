// A stand-in for the core when the page runs without Tauri, as it does
// under Vite and Playwright: a few entries with bodies, the simplest
// ranking (name matches first, then tags, then type), and a lookup by id.
// Enough to drive the panel, the share cards, and the entry page.

import type { Filter, Understood } from "@tablewright/schema";
import type { EntryDocument, SearchAnswer, Searcher, SpotlightHit } from "@tablewright/ui";

/** A fixture entry carries the facets the seeder would have read. */
interface FixtureEntry extends EntryDocument {
  facets: Record<string, string | number | boolean>;
}

const ENTRIES: FixtureEntry[] = [
  {
    id: "fx:spell:fire-bolt",
    type: "spell",
    name: "Fire Bolt",
    source: "fixture",
    tags: ["evocation", "cantrip"],
    facets: { level: 0, school: "evocation", ritual: false, concentration: false },
    body: "You hurl a mote of fire at a creature or an object within range.\n\n**Cantrip Upgrade.** The damage increases by 1d10 at levels 5, 11, and 17.",
    html: "<p>You hurl a mote of fire at a creature or an object within range.</p>\n<p><strong>Cantrip Upgrade.</strong> The damage increases by 1d10 at levels 5, 11, and 17.</p>\n",
    sections: [],
  },
  {
    id: "fx:spell:fireball",
    type: "spell",
    name: "Fireball",
    source: "fixture",
    tags: ["evocation", "level-3"],
    facets: { level: 3, school: "evocation", ritual: false, concentration: false },
    body: "A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion.",
    html: "<p>A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion.</p>\n",
    sections: [],
  },
  {
    id: "fx:spell:wall-of-fire",
    type: "spell",
    name: "Wall of Fire",
    source: "fixture",
    tags: ["evocation", "level-4"],
    facets: { level: 4, school: "evocation", ritual: false, concentration: true },
    body: "You create a wall of fire on a solid surface within range.",
    html: "<p>You create a wall of fire on a solid surface within range.</p>\n",
    sections: [],
  },
  {
    id: "fx:monster:fire-elemental",
    type: "monster",
    name: "Fire Elemental",
    source: "fixture",
    tags: ["elemental", "large", "cr-5"],
    facets: { cr: 5, size: "large" },
    body: "",
    html: "",
    sections: [],
  },
  {
    id: "fx:monster:goblin-warrior",
    type: "monster",
    name: "Goblin Warrior",
    source: "fixture",
    tags: ["fey", "small", "cr-1/4"],
    facets: { cr: 0.25, size: "small" },
    body: "",
    html: "",
    sections: [
      {
        label: "Traits",
        name: "Nimble Escape",
        note: "",
        html: "<p>The goblin can take the Disengage or Hide action as a Bonus Action on each of its turns.</p>\n",
      },
      {
        label: "Actions",
        name: "Scimitar",
        note: "",
        html: "<p><em>Melee Attack Roll:</em> +4, reach 5 ft. <em>Hit:</em> 5 (1d6 + 2) Slashing damage.</p>\n",
      },
      {
        label: "Actions",
        name: "Shortbow",
        note: "",
        html: "<p><em>Ranged Attack Roll:</em> +4, range 80/320 ft. <em>Hit:</em> 5 (1d6 + 2) Piercing damage.</p>\n",
      },
    ],
  },
  {
    id: "fx:item:longsword",
    type: "item",
    name: "Longsword",
    source: "fixture",
    tags: ["weapon"],
    facets: { category: "weapon" },
    body: "A longsword.\n\n| Cost | Weight |\n|---|---|\n| 15 gp | 3 lb |",
    html: "<p>A longsword.</p>\n<table>\n<thead>\n<tr>\n<th>Cost</th>\n<th>Weight</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>15 gp</td>\n<td>3 lb</td>\n</tr>\n</tbody>\n</table>\n",
    sections: [],
  },
  {
    id: "fx:magic-item:flame-tongue",
    type: "magic-item",
    name: "Flame Tongue",
    source: "fixture",
    tags: ["weapon", "fire", "rare", "attunement"],
    facets: { category: "weapon", rarity: "rare", attunement: true },
    body: "While holding this magic weapon, you can take a Bonus Action to cause flames to sheathe its blade.",
    html: "<p>While holding this magic weapon, you can take a Bonus Action to cause flames to sheathe its blade.</p>\n",
    sections: [],
  },
];

export const fixtureSearcher: Searcher = async (
  query: string,
  filters: Filter[]
): Promise<SearchAnswer> => {
  const started = performance.now();
  // The operator syntax only, with where each stretch sat in the text:
  // enough to drive the tray's selection and the mask under Playwright.
  // A tray filter on the same facet overrules the words, as the core does.
  const taken = new Set(filters.flatMap(facetsNamed));
  const understood: Understood[] = [];
  const tokens: string[] = [];
  let at = 0;
  for (const piece of query.split(/(\s+)/)) {
    const start = at;
    at += Array.from(piece).length;
    const token = piece.toLowerCase();
    if (token.trim() === "") {
      continue;
    }
    const filter = operatorFilter(token);
    if (filter === undefined) {
      tokens.push(token);
      continue;
    }
    const overruled = facetsNamed(filter).some((name) => taken.has(name));
    understood.push({ start, end: at, filter, overruled });
  }
  const applied: Filter[] = [
    ...understood.flatMap((item) => (item.overruled || item.filter === null ? [] : [item.filter])),
    ...filters,
  ];
  const scored = ENTRIES.flatMap((entry) => {
    if (!applied.every((filter) => passes(entry, filter))) {
      return [];
    }
    let score = 0;
    for (const token of tokens) {
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
    understood,
  };
};

const COMPARES = { "<=": "le", ">=": "ge", "<": "lt", ">": "gt", "=": "eq", ":": "eq" } as const;

// `type:spell`, `level<=3`, `school:evocation`; a word must lead.
function operatorFilter(token: string): Filter | undefined {
  if (token.startsWith("type:") && token.length > 5) {
    return { filter: "kind", value: token.slice(5) };
  }
  const match = /^([a-z_]+)(<=|>=|<|>|=|:)(.+)$/.exec(token);
  if (match === null) {
    return undefined;
  }
  const [, name, symbol, value] = match;
  if (name === undefined || symbol === undefined || value === undefined) {
    return undefined;
  }
  return { filter: "facet", name, compare: COMPARES[symbol as keyof typeof COMPARES], value };
}

function facetsNamed(filter: Filter): string[] {
  switch (filter.filter) {
    case "kind":
      return ["type"];
    case "tag":
      return ["tag"];
    case "source":
      return ["source"];
    case "facet":
      return [filter.name];
    case "any":
      return filter.items.flatMap(facetsNamed);
    case "not":
      return facetsNamed(filter.item);
    default:
      return [];
  }
}

function passes(entry: FixtureEntry, filter: Filter): boolean {
  switch (filter.filter) {
    case "kind":
      return entry.type === filter.value;
    case "tag":
      return entry.tags.includes(filter.value);
    case "source":
      return entry.source === filter.value;
    case "any":
      return filter.items.some((item) => passes(entry, item));
    case "not":
      return !passes(entry, filter.item);
    case "facet": {
      const have = entry.facets[filter.name];
      if (have === undefined) {
        return false;
      }
      if (typeof have === "number") {
        const want = numberOf(filter.value);
        if (want === undefined) {
          return false;
        }
        switch (filter.compare) {
          case "eq":
            return Math.abs(have - want) < 1e-9;
          case "lt":
            return have < want;
          case "le":
            return have <= want;
          case "gt":
            return have > want;
          case "ge":
            return have >= want;
          default:
            return false;
        }
      }
      return filter.compare === "eq" && String(have) === filter.value;
    }
    default:
      return false;
  }
}

function numberOf(value: string): number | undefined {
  const slash = value.indexOf("/");
  if (slash > 0) {
    const denominator = Number(value.slice(slash + 1));
    return denominator === 0 ? undefined : Number(value.slice(0, slash)) / denominator;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** The fixture's answer to `get_entry`. */
export function fixtureEntry(id: string): EntryDocument | undefined {
  return ENTRIES.find((entry) => entry.id === id);
}

function summaryOf(entry: EntryDocument): SpotlightHit {
  const { id, type, name, source, tags } = entry;
  return { id, type, name, source, tags };
}
