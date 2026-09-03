// How a hit is shown as a tile: its category, and the preview each
// category draws (design.md §3). The envelope summary carries only name,
// type, source, and tags, so previews are read from the tags a system's
// importer wrote: a spell's level, a creature's challenge, an item's
// rarity. Pure functions, so the rules are unit-tested without a DOM.

import type { SpotlightHit } from "./searcher.js";

export interface TilePreview {
  /** The group the tile belongs to: Spells, Bestiary, Items, or the kind itself. */
  category: string;
  /** The line under the name. */
  meta: string;
  /** A small label at the tile's foot: a challenge rating, a rarity, or the kind. */
  badge?: string;
  /** A ring at the tile's foot: a spell's level, C for a cantrip. */
  ring?: string;
}

export interface HitGroup {
  category: string;
  hits: SpotlightHit[];
}

const CATEGORY: Readonly<Record<string, string>> = {
  spell: "Spells",
  monster: "Bestiary",
  item: "Items",
  "magic-item": "Items",
};

const RARITIES = new Set(["common", "uncommon", "rare", "very-rare", "legendary", "artifact"]);

/** The category a kind is grouped under. Unknown kinds group by themselves. */
export function categoryOf(kind: string): string {
  return CATEGORY[kind] ?? titleCase(kind);
}

/** What a tile shows for `hit`. */
export function previewOf(hit: SpotlightHit): TilePreview {
  const category = categoryOf(hit.type);
  switch (hit.type) {
    case "spell": {
      const level = hit.tags.find((tag) => tag === "cantrip" || /^level-\d+$/.test(tag));
      const ring = level === undefined ? undefined : level === "cantrip" ? "C" : level.slice(6);
      return { category, meta: joinOr(without(hit.tags, level), hit.source), ring };
    }
    case "monster": {
      const cr = hit.tags.find((tag) => tag.startsWith("cr-"));
      const badge = cr === undefined ? undefined : `CR ${cr.slice(3)}`;
      return { category, meta: joinOr(without(hit.tags, cr), hit.source), badge };
    }
    case "item":
    case "magic-item": {
      const rarity = hit.tags.find((tag) => RARITIES.has(tag));
      const badge = rarity === undefined ? undefined : titleCase(rarity);
      return { category, meta: joinOr(without(hit.tags, rarity), hit.source), badge };
    }
    default:
      return { category, meta: joinOr(hit.tags, hit.source), badge: hit.type };
  }
}

/**
 * Group ranked hits by category. Groups appear in the order of their best
 * hit, and hits keep their rank order within a group: grouping is
 * presentation over the ranked list, never a reordering of it.
 */
export function groupHits(hits: readonly SpotlightHit[]): HitGroup[] {
  const groups: HitGroup[] = [];
  const byCategory = new Map<string, HitGroup>();
  for (const hit of hits) {
    const category = categoryOf(hit.type);
    let group = byCategory.get(category);
    if (group === undefined) {
      group = { category, hits: [] };
      byCategory.set(category, group);
      groups.push(group);
    }
    group.hits.push(hit);
  }
  return groups;
}

function without(tags: readonly string[], tag: string | undefined): string[] {
  return tags.filter((candidate) => candidate !== tag);
}

function joinOr(tags: readonly string[], fallback: string): string {
  return tags.length > 0 ? tags.join(" · ") : fallback;
}

function titleCase(text: string): string {
  return text
    .split("-")
    .map((word) => (word.length === 0 ? word : word[0]?.toUpperCase() + word.slice(1)))
    .join(" ");
}
