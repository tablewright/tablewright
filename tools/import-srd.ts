// Imports the 5e SRDs from Open5e into the house module format: SRD 5.2
// (the 2024 rules) to systems/5e/content/2024/srd, SRD 5.1 (the 2014
// rules) to systems/5e/content/2014/srd, and the 5.1 conditions, which
// Open5e keeps in a document of its own, to
// systems/5e/content/2014/core-conditions. Network glue and file shaping
// only: this tool knows nothing about the compendium store, which the Rust
// seeder owns. Design: docs/design.md §3 "Systems and modules" and "Two
// rule versions, one compendium".
//
// Usage: bun run import:srd [--refresh] [--only=<document>]
// Upstream pages are cached under data/srd/open5e (gitignored); --refresh
// fetches them again, and --only limits the run to one upstream document
// when the origin is slow. The committed module directories are the pin:
// re-running the import after an upstream change shows the drift as a diff.

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const API = "https://api.open5e.com/v2";
// Pages of 1000 time out at the origin; 200 is comfortably served.
const PAGE_SIZE = 200;
const ATTEMPTS = 4;
const ROOT = join(import.meta.dir, "..");
const CACHE_DIR = join(ROOT, "data", "srd", "open5e");
const CONTENT_DIR = join(ROOT, "systems", "5e", "content");

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

type Shaped = Omit<Entry, "id" | "source" | "data">;

interface Kind {
  endpoint: string;
  type: string;
  directory: string;
  shape: (record: Upstream) => Shaped;
}

// One upstream document becomes one module of one rule version.
interface Source {
  document: string;
  version: string;
  moduleId: string;
  name: string;
  /** Which SRD the text is, for the attribution notice. */
  srd: "5.1" | "5.2";
  /** How Open5e carries it, for the attribution notice. */
  via: string;
  outDir: string;
  kinds: Kind[];
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
  // Conditions: Open5e carries none under either SRD document; the 5.1
  // text ships from its core document as a module of its own, below.
];

const SOURCES: Source[] = [
  {
    document: "srd-2024",
    version: "2024",
    moduleId: "5e-2024-srd",
    name: "5e SRD 5.2",
    srd: "5.2",
    via: "",
    outDir: join(CONTENT_DIR, "2024", "srd"),
    kinds: KINDS,
  },
  {
    document: "srd-2014",
    version: "2014",
    moduleId: "5e-2014-srd",
    name: "5e SRD 5.1",
    srd: "5.1",
    via: "",
    outDir: join(CONTENT_DIR, "2014", "srd"),
    kinds: KINDS,
  },
  // Open5e's "5e Core Concepts" document: the SRD 5.1 text, CC-BY-4.0, by
  // the SRD's own authors. Its fifteen conditions are a module named for
  // what they are, so a search for "frightened" has a page to open in both
  // versions while the 2024 wording is not published in structured form.
  {
    document: "core",
    version: "2014",
    moduleId: "5e-2014-core-conditions",
    name: "5e conditions (SRD 5.1 text)",
    srd: "5.1",
    via: " as its 5e Core Concepts document",
    outDir: join(CONTENT_DIR, "2014", "core-conditions"),
    kinds: [
      { endpoint: "conditions", type: "condition", directory: "conditions", shape: shapeCondition },
    ],
  },
];

const refresh = process.argv.includes("--refresh");
const only = process.argv.find((argument) => argument.startsWith("--only="))?.slice(7);
const started = performance.now();

for (const source of SOURCES) {
  if (only !== undefined && source.document !== only) {
    continue;
  }
  await importSource(source);
}
console.log(`done in ${Math.round(performance.now() - started)} ms`);

async function importSource(source: Source): Promise<void> {
  const counts: Record<string, number> = {};
  let fetched = "";
  for (const kind of source.kinds) {
    const cache = await load(kind.endpoint, source.document);
    fetched = cache.fetched > fetched ? cache.fetched : fetched;
    const directory = join(source.outDir, kind.directory);
    await rm(directory, { recursive: true, force: true });
    // The API's document filter leaks other documents' records into some
    // lists (items carried the 2014 SRD too), so the document is checked here.
    const records = cache.results.filter((record) => keyOf(record.document) === source.document);
    const leaked = cache.results.length - records.length;
    if (leaked > 0) {
      console.log(`${source.document} ${kind.endpoint}: dropped ${leaked} from other documents`);
    }
    if (records.length === 0) {
      continue;
    }
    await mkdir(directory, { recursive: true });
    const seen = new Set<string>();
    for (const record of records) {
      const slug = slugOf(record.key, `${source.document}_`);
      if (seen.has(slug)) {
        throw new Error(`${source.document} ${kind.endpoint}: duplicate slug ${slug}`);
      }
      seen.add(slug);
      const shaped = kind.shape(record);
      const entry: Entry = {
        id: `${source.moduleId}:${kind.type}:${slug}`,
        type: shaped.type,
        name: shaped.name,
        source: source.moduleId,
        tags: shaped.tags,
        body: shaped.body,
        data: sorted(withoutDocument(record)),
      };
      await Bun.write(join(directory, `${slug}.json`), `${JSON.stringify(entry, null, 2)}\n`);
    }
    counts[kind.type] = records.length;
  }

  const manifest = {
    id: source.moduleId,
    name: source.name,
    system: "5e",
    systemVersion: source.version,
    version: fetched.slice(0, 10),
    license: "CC-BY-4.0",
    attribution: attribution(source.srd, source.via),
    upstream: { name: "Open5e", api: API, document: source.document, fetched },
    kinds: counts,
  };
  await Bun.write(join(source.outDir, "module.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const summary = Object.entries(counts)
    .map(([type, count]) => `${count} ${type.endsWith("s") ? `${type}es` : `${type}s`}`)
    .join(", ");
  console.log(`${source.moduleId}: ${summary} (upstream fetched ${fetched})`);
}

// The notice CC-BY-4.0 asks for, as Wizards words it for each SRD.
function attribution(srd: "5.1" | "5.2", via: string): string {
  return (
    `This work includes material from the System Reference Document ${srd} ("SRD ${srd}") by ` +
    "Wizards of the Coast LLC, available at " +
    `https://dnd.wizards.com/resources/systems-reference-document. The SRD ${srd} is licensed ` +
    "under the Creative Commons Attribution 4.0 International License, available at " +
    "https://creativecommons.org/licenses/by/4.0/legalcode. Transcribed to structured data " +
    `by Open5e (https://open5e.com)${via} and reshaped for Tablewright.`
  );
}

// Reads the cached upstream list for an endpoint of a document, fetching it
// when absent or when --refresh was given.
async function load(endpoint: string, document: string): Promise<Cache> {
  const file = Bun.file(join(CACHE_DIR, `${document}-${endpoint}.json`));
  if (!refresh && (await file.exists())) {
    return (await file.json()) as Cache;
  }
  // Lists disagree on which document filter they honour (`document=` on
  // magic items, `document__key=` on creatures and spells), so both are
  // sent; the document check above catches whatever still leaks.
  const first = `${API}/${endpoint}/?document=${document}&document__key=${document}&limit=${PAGE_SIZE}`;
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
        signal: AbortSignal.timeout(120_000),
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

function shapeCreature(record: Upstream): Shaped {
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

function shapeSpell(record: Upstream): Shaped {
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

function shapeItem(record: Upstream): Shaped {
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

function shapeMagicItem(record: Upstream): Shaped {
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
//
// A class page reads in the order a player expects, the Aetherblade
// write-up being the model: the prose, the class table, then hit points,
// proficiencies and equipment; the features follow as the page's own
// sections, by level. Open5e files the table's columns and those blocks
// among the features, typed, so the transformer builds the body from them
// here. The rows stay in `data` untouched: the real features for the
// page, the column data for the character builder later.
function shapeClass(record: Upstream): Shaped {
  const parent = keyOf(record.subclass_of);
  const tags = compact([
    parent === undefined ? undefined : "subclass",
    parent === undefined ? undefined : slugOf(parent),
    keyOf(record.caster_type)?.toLowerCase(),
  ]);
  const rows = classRows(record);
  const body =
    parent === undefined
      ? compact([text(record.desc), classTable(record.name, rows), coreTraits(record, rows)]).join(
          "\n\n"
        )
      : text(record.desc);
  return { type: "class", name: record.name, tags, body };
}

interface ClassRow {
  name: string;
  feature_type: string;
  desc: string;
  gained_at: { level: number }[];
  data_for_class_table: { level: number; column_value: string }[];
}

function classRows(record: Upstream): ClassRow[] {
  const features = Array.isArray(record.features) ? record.features : [];
  return features.map((feature) => {
    const row = feature as Record<string, unknown>;
    if (Array.isArray(row.gained_at)) {
      // Upstream lists the levels a feature is gained at in text order
      // (12, 16, 4, 8); the page sorts sections by the first, so the
      // record itself is put in order before it is written.
      (row.gained_at as { level: number }[]).sort((a, b) => a.level - b.level);
    }
    return {
      name: text(row.name),
      feature_type: text(row.feature_type),
      desc: text(row.desc),
      gained_at: Array.isArray(row.gained_at)
        ? (row.gained_at as { level: number }[]).filter((at) => typeof at.level === "number")
        : [],
      data_for_class_table: Array.isArray(row.data_for_class_table)
        ? (row.data_for_class_table as { level: number; column_value: string }[])
        : [],
    };
  });
}

// The class table: a level a row; proficiency bonus, the features gained
// at that level, the class's own columns, then the spell slots by rank.
function classTable(name: string, rows: ClassRow[]): string {
  const bonus = rows.find((row) => row.feature_type === "PROFICIENCY_BONUS");
  const own = rows.filter((row) => row.feature_type === "CLASS_TABLE_DATA");
  const slots = rows
    .filter((row) => row.feature_type === "SPELL_SLOTS")
    .sort((a, b) => Number.parseInt(a.name, 10) - Number.parseInt(b.name, 10));
  const features = rows.filter((row) => row.feature_type === "CLASS_LEVEL_FEATURE");
  const top = Math.max(
    20,
    ...rows.flatMap((row) => row.data_for_class_table.map((cell) => cell.level)),
    ...features.flatMap((row) => row.gained_at.map((at) => at.level))
  );
  if (bonus === undefined && own.length === 0 && slots.length === 0) {
    return "";
  }
  const cellOf = (row: ClassRow | undefined, level: number): string =>
    row?.data_for_class_table.find((cell) => cell.level === level)?.column_value.trim() || "—";
  const columns = [
    { name: "Proficiency Bonus", align: ":---:", at: (level: number) => cellOf(bonus, level) },
    {
      name: "Features",
      align: "---",
      at: (level: number) =>
        features
          .filter((row) => row.gained_at.some((at) => at.level === level))
          .map((row) => row.name)
          .join(", ") || "—",
    },
    ...own.map((row) => ({
      name: row.name,
      align: ":---:",
      at: (level: number) => cellOf(row, level),
    })),
    ...slots.map((row) => ({
      name: row.name,
      align: ":---:",
      at: (level: number) => cellOf(row, level),
    })),
  ];
  const lines = [
    `## The ${name} Table`,
    "",
    `| Level | ${columns.map((column) => column.name).join(" | ")} |`,
    `| --- | ${columns.map((column) => column.align).join(" | ")} |`,
  ];
  for (let level = 1; level <= top; level += 1) {
    lines.push(`| ${ordinal(level)} | ${columns.map((column) => column.at(level)).join(" | ")} |`);
  }
  return lines.join("\n");
}

// Hit points, proficiencies and equipment. The 2024 text carries them as
// one core traits table with an empty header, which takes the row's name;
// the 2014 text carries hit points as fields and the other two as rows,
// which become the blocks a class write-up has always had.
function coreTraits(record: Upstream, rows: ClassRow[]): string {
  const core = rows.find((row) => row.feature_type === "CORE_TRAITS_TABLE");
  if (core !== undefined) {
    return core.desc.replace(/^\|\|\|\s*$/m, `| ${core.name} | |`);
  }
  const points = (record.hit_points ?? {}) as Record<string, unknown>;
  const hitPoints = compact([
    text(points.hit_dice_name) === "" ? undefined : `**Hit Dice:** ${text(points.hit_dice_name)}`,
    text(points.hit_points_at_1st_level) === ""
      ? undefined
      : `**Hit Points at 1st Level:** ${text(points.hit_points_at_1st_level)}`,
    text(points.hit_points_at_higher_levels) === ""
      ? undefined
      : `**Hit Points at Higher Levels:** ${text(points.hit_points_at_higher_levels)}`,
  ]);
  const proficiencies = rows.find((row) => row.feature_type === "PROFICIENCIES");
  const equipment = rows.find((row) => row.feature_type === "STARTING_EQUIPMENT");
  return compact([
    hitPoints.length === 0 ? undefined : `## Hit Points\n${hitPoints.join("\n")}`,
    proficiencies === undefined ? undefined : `## Proficiencies\n${proficiencies.desc}`,
    equipment === undefined ? undefined : `## Equipment\n${equipment.desc}`,
  ]).join("\n\n");
}

function ordinal(level: number): string {
  const rest = level % 100;
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  const suffix = rest >= 11 && rest <= 13 ? "th" : (suffixes[level % 10] ?? "th");
  return `${level}${suffix}`;
}

function shapeRace(record: Upstream): Shaped {
  const parent = keyOf(record.subspecies_of);
  const tags = compact([
    parent === undefined ? undefined : "subrace",
    parent === undefined ? undefined : slugOf(parent),
  ]);
  return { type: "race", name: record.name, tags, body: text(record.desc) };
}

function shapeBackground(record: Upstream): Shaped {
  return { type: "background", name: record.name, tags: [], body: text(record.desc) };
}

// A feat's benefits carry text but no names, so they are the body.
function shapeFeat(record: Upstream): Shaped {
  const benefits = Array.isArray(record.benefits)
    ? record.benefits.map((benefit) => text((benefit as { desc?: unknown }).desc))
    : [];
  const tags = compact([keyOf(record.type)?.toLowerCase()]);
  const body = compact([text(record.desc), ...benefits]).join("\n\n");
  return { type: "feat", name: record.name, tags, body };
}

function shapeRule(record: Upstream): Shaped {
  const ruleset = keyOf(record.ruleset);
  const tags = compact([ruleset === undefined ? undefined : slugOf(ruleset)]);
  return { type: "rule", name: record.name, tags, body: text(record.desc) };
}

// A condition's text comes as a list of descriptions, one paragraph each.
function shapeCondition(record: Upstream): Shaped {
  const descriptions = Array.isArray(record.descriptions) ? record.descriptions : [];
  const body = compact(
    descriptions.map((description) => text((description as { desc?: unknown }).desc))
  ).join("\n\n");
  return { type: "condition", name: record.name, tags: [], body };
}

// Upstream keys look like `srd-2024_goblin-warrior`; the slug is the rest.
// A rule's key nests its section with a second underscore, which becomes a
// dash so the id stays one word. Keys from other documents are taken whole,
// less their own prefix: a spell's class list names `srd-2024_wizard`.
function slugOf(key: string, prefix?: string): string {
  const rest =
    prefix !== undefined && key.startsWith(prefix)
      ? key.slice(prefix.length)
      : key.replace(/^[a-z0-9-]+_/, "");
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

// Upstream text arrives with either line ending; the module keeps one.
function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
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
