// Imports the 5e SRD 5.2 (2024 rules) from Open5e into the house module
// format at systems/5e/content/2024/srd. Network glue and file shaping
// only: this tool knows nothing about the compendium store, which the Rust
// seeder owns. Design: docs/design.md §3 "Systems and modules".
//
// Usage: bun run import:srd [--refresh]
// Upstream pages are cached under data/srd/open5e (gitignored); --refresh
// fetches them again. The committed module directory is the pin: re-running
// the import after an upstream change shows the drift as a diff.

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const API = "https://api.open5e.com/v2";
const DOCUMENT = "srd-2024";
const KEY_PREFIX = `${DOCUMENT}_`;
const MODULE_ID = "5e-2024-srd";
// Pages of 1000 time out at the origin; 200 is comfortably served.
const PAGE_SIZE = 200;
const ATTEMPTS = 4;
const ROOT = join(import.meta.dir, "..");
const CACHE_DIR = join(ROOT, "data", "srd", "open5e");
const OUT_DIR = join(ROOT, "systems", "5e", "content", "2024", "srd");

// The envelope as the Rust core defines it (crates/core/src/compendium.rs),
// less the visibility fields: who may see an entry is the kind default the
// system manifest declares, so the module says nothing. Mirrored here by
// hand only because this tool runs before packages/schema exists; once it
// does, import the generated type instead.
interface Entry {
  id: string;
  type: string;
  name: string;
  source: string;
  tags: string[];
  body: string;
  data: Record<string, unknown>;
}

interface Upstream {
  key: string;
  name: string;
  [field: string]: unknown;
}

interface Page {
  count: number;
  next: string | null;
  results: Upstream[];
}

interface Cache {
  fetched: string;
  url: string;
  results: Upstream[];
}

interface Kind {
  endpoint: string;
  type: string;
  directory: string;
  shape: (record: Upstream) => Omit<Entry, "id" | "source" | "data">;
}

const KINDS: Kind[] = [
  { endpoint: "creatures", type: "monster", directory: "monsters", shape: shapeCreature },
  { endpoint: "spells", type: "spell", directory: "spells", shape: shapeSpell },
  { endpoint: "items", type: "item", directory: "items", shape: shapeItem },
  { endpoint: "magicitems", type: "magic-item", directory: "magic-items", shape: shapeMagicItem },
  { endpoint: "classes", type: "class", directory: "classes", shape: shapeClass },
  // Open5e calls them species, as the 2024 rules do; Tablewright names the
  // kind race by choice, and the box answers to both words.
  { endpoint: "species", type: "race", directory: "races", shape: shapeRace },
  { endpoint: "backgrounds", type: "background", directory: "backgrounds", shape: shapeBackground },
  { endpoint: "feats", type: "feat", directory: "feats", shape: shapeFeat },
  { endpoint: "rules", type: "rule", directory: "rules", shape: shapeRule },
  // Conditions: Open5e carries none under srd-2024 (only its own core
  // and A5E documents), so the kind is declared in the manifest and
  // waits for upstream, or for a hand import of the SRD 5.2 glossary.
];

const refresh = process.argv.includes("--refresh");
const started = performance.now();
const counts: Record<string, number> = {};
let fetched = "";

for (const kind of KINDS) {
  const cache = await load(kind.endpoint);
  fetched = cache.fetched > fetched ? cache.fetched : fetched;
  const directory = join(OUT_DIR, kind.directory);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  // The API's document filter leaks other documents' records into some
  // lists (items carried the 2014 SRD too), so the document is checked here.
  const records = cache.results.filter((record) => keyOf(record.document) === DOCUMENT);
  const leaked = cache.results.length - records.length;
  if (leaked > 0) {
    console.log(`${kind.endpoint}: dropped ${leaked} records from other documents`);
  }
  const seen = new Set<string>();
  for (const record of records) {
    const slug = slugOf(record.key);
    if (seen.has(slug)) {
      throw new Error(`${kind.endpoint}: duplicate slug ${slug}`);
    }
    seen.add(slug);
    const shaped = kind.shape(record);
    const entry: Entry = {
      id: `${MODULE_ID}:${kind.type}:${slug}`,
      type: shaped.type,
      name: shaped.name,
      source: MODULE_ID,
      tags: shaped.tags,
      body: shaped.body,
      data: sorted(withoutDocument(record)),
    };
    await Bun.write(join(directory, `${slug}.json`), `${JSON.stringify(entry, null, 2)}\n`);
  }
  counts[kind.type] = records.length;
}

const manifest = {
  id: MODULE_ID,
  name: "5e SRD 5.2",
  system: "5e",
  systemVersion: "2024",
  version: fetched.slice(0, 10),
  license: "CC-BY-4.0",
  attribution:
    'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by ' +
    "Wizards of the Coast LLC, available at " +
    "https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.2 is licensed " +
    "under the Creative Commons Attribution 4.0 International License, available at " +
    "https://creativecommons.org/licenses/by/4.0/legalcode. Transcribed to structured data " +
    "by Open5e (https://open5e.com) and reshaped for Tablewright.",
  upstream: { name: "Open5e", api: API, document: DOCUMENT, fetched },
  kinds: counts,
};
await Bun.write(join(OUT_DIR, "module.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const elapsed = Math.round(performance.now() - started);
const summary = Object.entries(counts)
  .map(([type, count]) => `${count} ${type}s`)
  .join(", ");
console.log(`${MODULE_ID}: ${summary} in ${elapsed} ms (upstream fetched ${fetched})`);

// Reads the cached upstream list for an endpoint, fetching it when absent or
// when --refresh was given.
async function load(endpoint: string): Promise<Cache> {
  const file = Bun.file(join(CACHE_DIR, `${endpoint}.json`));
  if (!refresh && (await file.exists())) {
    return (await file.json()) as Cache;
  }
  // Lists disagree on which document filter they honour (`document=` on
  // magic items, `document__key=` on creatures and spells), so both are
  // sent; the document check above catches whatever still leaks.
  const first = `${API}/${endpoint}/?document=${DOCUMENT}&document__key=${DOCUMENT}&limit=${PAGE_SIZE}`;
  const results: Upstream[] = [];
  let url: string | null = first;
  while (url !== null) {
    console.log(`fetch ${url}`);
    const page = await fetchPage(url);
    results.push(...page.results);
    url = page.next;
  }
  const cache: Cache = { fetched: new Date().toISOString(), url: first, results };
  await mkdir(CACHE_DIR, { recursive: true });
  await Bun.write(file, `${JSON.stringify(cache, null, 2)}\n`);
  return cache;
}

// One page, retried with backoff: the origin answers 5xx now and then.
async function fetchPage(url: string): Promise<Page> {
  let failure = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "tablewright-import-srd" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        return (await response.json()) as Page;
      }
      failure = `${response.status} ${response.statusText}`;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < ATTEMPTS) {
      const delay = 1000 * 2 ** (attempt - 1);
      console.log(`  ${failure}; retrying in ${delay} ms`);
      await Bun.sleep(delay);
    }
  }
  throw new Error(`${url}: ${failure} after ${ATTEMPTS} attempts`);
}

function shapeCreature(record: Upstream): Omit<Entry, "id" | "source" | "data"> {
  const tags = compact([
    keyOf(record.type),
    keyOf(record.size),
    challengeTag(record.challenge_rating),
  ]);
  // The SRD gives monsters no lore text; the statblock is the data.
  return {
    type: "monster",
    name: record.name,
    tags,
    body: "",
  };
}

function shapeSpell(record: Upstream): Omit<Entry, "id" | "source" | "data"> {
  const level = typeof record.level === "number" ? record.level : undefined;
  const classes = Array.isArray(record.classes)
    ? record.classes.map((entry) => slugOf(keyOf(entry) ?? ""))
    : [];
  const tags = compact([
    keyOf(record.school),
    level === undefined ? undefined : level === 0 ? "cantrip" : `level-${level}`,
    ...classes,
    record.ritual === true ? "ritual" : undefined,
    record.concentration === true ? "concentration" : undefined,
  ]);
  const upgrade = level === 0 ? "Cantrip Upgrade" : "Using a Higher-Level Spell Slot";
  const body = compact([
    text(record.desc),
    text(record.higher_level) === "" ? undefined : `**${upgrade}.** ${text(record.higher_level)}`,
  ]).join("\n\n");
  return {
    type: "spell",
    name: record.name,
    tags,
    body,
  };
}

function shapeItem(record: Upstream): Omit<Entry, "id" | "source" | "data"> {
  const tags = compact([
    keyOf(record.category),
    keyOf(record.rarity),
    record.requires_attunement === true ? "attunement" : undefined,
  ]);
  return {
    type: "item",
    name: record.name,
    tags,
    body: text(record.desc),
  };
}

function shapeMagicItem(record: Upstream): Omit<Entry, "id" | "source" | "data"> {
  const tags = compact([
    keyOf(record.category) ?? keyOf(record.type),
    keyOf(record.rarity),
    record.requires_attunement === true ? "attunement" : undefined,
  ]);
  return {
    type: "magic-item",
    name: record.name,
    tags,
    body: text(record.desc),
  };
}

// A class, species or background is one file, with its subclasses,
// subspecies and the like as entries of their own; a rule's key carries
// its section too, joined by an underscore, which becomes a dash.
function shapeClass(record: Upstream): Omit<Entry, "id" | "source" | "data"> {
  const parent = keyOf(record.subclass_of);
  const tags = compact([
    parent === undefined ? undefined : "subclass",
    parent === undefined ? undefined : slugOf(parent),
    keyOf(record.caster_type)?.toLowerCase(),
  ]);
  return { type: "class", name: record.name, tags, body: text(record.desc) };
}

function shapeRace(record: Upstream): Omit<Entry, "id" | "source" | "data"> {
  const parent = keyOf(record.subspecies_of);
  const tags = compact([
    parent === undefined ? undefined : "subrace",
    parent === undefined ? undefined : slugOf(parent),
  ]);
  return { type: "race", name: record.name, tags, body: text(record.desc) };
}

function shapeBackground(record: Upstream): Omit<Entry, "id" | "source" | "data"> {
  return { type: "background", name: record.name, tags: [], body: text(record.desc) };
}

// A feat's benefits carry text but no names, so they are the body.
function shapeFeat(record: Upstream): Omit<Entry, "id" | "source" | "data"> {
  const benefits = Array.isArray(record.benefits)
    ? record.benefits.map((benefit) => text((benefit as { desc?: unknown }).desc))
    : [];
  const tags = compact([keyOf(record.type)?.toLowerCase()]);
  const body = compact([text(record.desc), ...benefits]).join("\n\n");
  return { type: "feat", name: record.name, tags, body };
}

function shapeRule(record: Upstream): Omit<Entry, "id" | "source" | "data"> {
  const ruleset = keyOf(record.ruleset);
  const tags = compact([ruleset === undefined ? undefined : slugOf(ruleset)]);
  return { type: "rule", name: record.name, tags, body: text(record.desc) };
}

// Upstream keys look like `srd-2024_goblin-warrior`; the slug is the rest.
// A rule's key nests its section with a second underscore, which becomes a
// dash so the id stays one word.
function slugOf(key: string): string {
  const rest = key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key;
  const slug = rest.replace(/_/g, "-");
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`unusable slug in key ${key}`);
  }
  return slug;
}

function keyOf(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value !== null && typeof value === "object" && "key" in value) {
    const key = (value as { key: unknown }).key;
    return typeof key === "string" ? key : undefined;
  }
  return undefined;
}

function challengeTag(value: unknown): string | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  const fractions: Record<number, string> = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };
  return `cr-${fractions[value] ?? String(value)}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compact(values: (string | undefined)[]): string[] {
  return values.filter((value): value is string => value !== undefined && value !== "");
}

// The document block repeats the module's provenance in every record;
// module.json carries it once.
function withoutDocument(record: Upstream): Record<string, unknown> {
  const { document: _document, ...rest } = record;
  return rest;
}

// Sorted keys at every level make the output independent of upstream
// ordering, so re-runs diff only when content changes.
function sorted(value: Record<string, unknown>): Record<string, unknown> {
  return sortValue(value) as Record<string, unknown>;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, sortValue(object[key])])
    );
  }
  return value;
}
