// A stand-in for the core when the page runs without Tauri, as it does
// under Vite and Playwright. The cast is what the core answered for a
// short list of things, written by the seed (design.md §3 "The stand-in's
// cast"). Only the search is this file's own: the simplest ranking (name
// matches first, then tags, then type), the operator filters, and one hit
// per thing, as the core folds.

import type {
  Cast,
  CastEntry,
  EntrySummary,
  Filter,
  SystemManifest,
  Understood,
  Visibility,
} from "@tablewright/schema";
import type { EntryDocument, SearchAnswer, SpotlightHit } from "@tablewright/ui";
import { documentOf } from "../entry-document.js";
import raw from "./fixture.json";

// The file is what the seed wrote from the type the bindings carry; the
// cast is read as that type rather than as whatever the JSON looks like.
const fixture = raw as unknown as Cast;
const system = fixture.system;
if (system === null) {
  throw new Error("The cast carries no system manifest; run `bun run seed`.");
}

/** The system manifest as the seed stored it. */
export const fixtureSystem: SystemManifest = system;
/** The text values each facet holds across the whole compendium. */
export const fixtureFacetValues: Record<string, string[]> = fixture.facetValues;

const CAST: readonly CastEntry[] = fixture.entries;

export const fixtureSearcher = async (
  query: string,
  filters: Filter[],
  version = "",
  viewer: Visibility = "dm"
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
  const scored = CAST.flatMap(({ summary }) => {
    if (!seenBy(summary, viewer) || !applied.every((filter) => passes(summary, filter))) {
      return [];
    }
    let score = 0;
    for (const token of tokens) {
      const name = summary.name.toLowerCase();
      if (name.startsWith(token)) {
        score += 0;
      } else if (name.includes(token)) {
        score += 1;
      } else if (summary.tags.some((tag) => tag.includes(token))) {
        score += 4;
      } else if (summary.type.includes(token)) {
        score += 8;
      } else {
        return [];
      }
    }
    return [{ summary, score }];
  });
  scored.sort((a, b) => a.score - b.score || a.summary.name.localeCompare(b.summary.name));
  // One hit per thing, as the core folds: the asked-for version when it
  // matched, else whichever ranked first stands in.
  const chosen = new Map<string, EntrySummary>();
  for (const { summary } of scored) {
    const key = thingOf(summary);
    const kept = chosen.get(key);
    if (kept === undefined || (kept.version !== version && summary.version === version)) {
      chosen.set(key, summary);
    }
  }
  return {
    hits: [...chosen.values()].map(hitOf),
    elapsedUs: Math.round((performance.now() - started) * 1000),
    catalogueSize: CAST.length,
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

function passes(summary: EntrySummary, filter: Filter): boolean {
  switch (filter.filter) {
    case "kind":
      return summary.type === filter.value;
    case "tag":
      return summary.tags.includes(filter.value);
    case "source":
      return summary.source === filter.value;
    case "any":
      return filter.items.some((item) => passes(summary, item));
    case "not":
      return !passes(summary, filter.item);
    case "facet": {
      const have = summary.facets?.[filter.name];
      if (have === undefined || have === null) {
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

/**
 * The answer to `get_entry`: the entry, or with a version the same thing
 * in that version when there is one, as the core answered it for the
 * viewer. The cast holds the DM's answer and the party's; a page is one
 * or the other.
 */
export function fixtureEntry(
  id: string,
  version?: string,
  viewer: Visibility = "dm"
): EntryDocument | undefined {
  const asked = CAST.find((cast) => cast.summary.id === id);
  if (asked === undefined) {
    return undefined;
  }
  const thing = thingOf(asked.summary);
  const found =
    CAST.find((cast) => thingOf(cast.summary) === thing && cast.summary.version === version) ??
    asked;
  const entry = viewer === "dm" ? found.dm : found.party;
  return entry === null ? undefined : documentOf(entry);
}

// The tiers in order, as the core keeps them: world < party < dm.
function seenBy(summary: EntrySummary, viewer: Visibility): boolean {
  return rank(viewer) >= rank(summary.visibility);
}

function rank(tier: Visibility): number {
  return tier === "dm" ? 2 : tier === "party" ? 1 : 0;
}

// `<kind>:<slug>`, the thing an entry is a version of, as the core reads it.
function thingOf(summary: EntrySummary): string {
  return `${summary.type}:${summary.id.split(":").at(-1) ?? summary.id}`;
}

function hitOf(summary: EntrySummary): SpotlightHit {
  const { id, type, name, source, tags, version } = summary;
  return { id, type, name, source, tags, version: version ?? "" };
}
