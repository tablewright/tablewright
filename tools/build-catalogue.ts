// Writes .ai/CATALOGUE.md: the shared names of the packages, each with
// the sentence its doc comment opens on, so a session starts knowing what
// exists before it writes anything (.ai/REUSE.md). Listed are the UI's
// files by the feature they serve, and the board's `shared/` files with
// the names a second domain runs, by domain. A listed
// function or class with no doc comment fails the run, so the sentence
// gets written; a constant without one is listed by its name, which is
// all STYLE.md asks of a constant. `--check` refuses a stale file; run by
// `bun run check`.

import { readdirSync, statSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { filesUnder } from "./files.js";

const ROOT = join(import.meta.dir, "..");
const OUT_PATH = ".ai/CATALOGUE.md";
const UI = "packages/ui/src";
const BOARD = "packages/board/src";
const SHARED = "shared";
// Generated tables are data, not vocabulary.
const SKIPPED = new Set(["packages/ui/src/atoms/glyphs.ts"]);

const EXPORT =
  /^export (?:declare )?(?:async )?(function\*?|const|let|class|abstract class|enum|interface|type) (\w+)/gm;
const ELEMENT = /customElements\.define\(\s*"([^"]+)",\s*(\w+)\s*\)/g;

interface Named {
  readonly name: string;
  readonly kind: "function" | "class" | "value" | "type";
  readonly said: string | undefined;
}

interface Listed {
  readonly path: string;
  readonly names: readonly Named[];
  readonly tags: ReadonlyMap<string, string>;
}

// The sources the catalogue reads: every one but a barrel and a generated table.
function sourcesUnder(folder: string): string[] {
  return filesUnder(ROOT, folder).filter(
    (path) => path.endsWith(".ts") && posix.basename(path) !== "index.ts" && !SKIPPED.has(path)
  );
}

// A doc comment's words, without the gutter or the tags that follow them.
function proseOf(comment: string): string {
  return comment
    .replace(/^\/\*\*|\*\/$/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*? ?/, "").trimEnd())
    .join("\n")
    .split(/\n\s*@/)[0]!
    .trim();
}

// The opening sentence: up to the first full stop outside code, or the
// first blank line, whichever comes first.
function openingOf(prose: string): string {
  const paragraph = prose
    .split(/\n\s*\n/)[0]!
    .replace(/\s+/g, " ")
    .trim();
  let inCode = false;
  for (let at = 0; at < paragraph.length; at += 1) {
    const letter = paragraph[at];
    if (letter === "`") {
      inCode = !inCode;
    } else if (letter === "." && !inCode && (paragraph[at + 1] ?? " ") === " ") {
      return paragraph.slice(0, at + 1);
    }
  }
  return paragraph;
}

// The `/** … */` that ends right above `at`, when there is one.
function commentAbove(text: string, at: number): string | undefined {
  const before = text.slice(0, at).trimEnd();
  if (!before.endsWith("*/")) {
    return undefined;
  }
  const opens = before.lastIndexOf("/**");
  return opens === -1 ? undefined : before.slice(opens);
}

// What a file says it is for: the prose of its `─ title ─` preamble, or of
// the line comments it opens on.
function preambleOf(text: string): string | undefined {
  const titled = /^\/\*\*\s*\n\s*\* ─[^\n]*─\s*\n([\s\S]*?)\*\//.exec(text);
  const lined = /^(?:\/\/[^\n]*\n)+/.exec(text);
  const prose =
    titled === null
      ? (lined?.[0] ?? "").replace(/^\/\/ ?/gm, "").trim()
      : proseOf(`/**${titled[1]}*/`).replace(/\n?Design:[\s\S]*$/, "");
  return prose === "" ? undefined : openingOf(prose);
}

function read(path: string): Promise<string> {
  return Bun.file(join(ROOT, path)).text();
}

async function list(path: string, only?: (named: Named, path: string) => boolean): Promise<Listed> {
  const text = await read(path);
  const tags = new Map<string, string>();
  for (const found of text.matchAll(ELEMENT)) {
    tags.set(found[2]!, found[1]!);
  }
  const names: Named[] = [];
  for (const found of text.matchAll(EXPORT)) {
    const word = found[1]!;
    const name = found[2]!;
    const kind =
      word === "interface" || word === "type"
        ? "type"
        : word.startsWith("function")
          ? "function"
          : word.endsWith("class")
            ? "class"
            : "value";
    const comment = commentAbove(text, found.index);
    // An element with no comment of its own is what its file's preamble says.
    const said =
      comment === undefined
        ? tags.has(name)
          ? preambleOf(text)
          : undefined
        : openingOf(proseOf(comment));
    const named: Named = { name, kind, said };
    if (only === undefined || only(named, path)) {
      names.push(named);
    }
  }
  return { path, names, tags };
}

// A named import, braces and all; braces never nest in one.
const IMPORT = /^import\s+(type\s+)?\{([^}]*)\}\s+from\s+"(\.[^"]+)"/gm;

// What the board shares, by file: every name of a `shared/` file, and of a
// domain's file the names that code in another domain runs. A type
// borrowed is a shape, not a use, so type imports do not count.
async function sharedInBoard(): Promise<Map<string, Set<string> | "all">> {
  const files = sourcesUnder(BOARD);
  const domainOf = (path: string): string => {
    const parts = relative(BOARD, path).split(/[\\/]/);
    return parts.length > 1 ? parts[0]! : "";
  };
  const taken = new Map<string, Set<string>>();
  for (const path of files) {
    for (const found of (await read(path)).matchAll(IMPORT)) {
      const target = posix.join(dirname(path), found[3]!).replace(/\.js$/, ".ts");
      if (found[1] !== undefined || domainOf(target) === domainOf(path)) {
        continue;
      }
      const names = taken.get(target) ?? new Set<string>();
      for (const part of found[2]!.split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0]!;
        if (name !== "" && !name.startsWith("type ")) {
          names.add(name);
        }
      }
      taken.set(target, names);
    }
  }
  const shared = new Map<string, Set<string> | "all">();
  for (const path of files) {
    if (domainOf(path) === SHARED) {
      shared.set(path, "all");
    } else if ((taken.get(path)?.size ?? 0) > 0) {
      shared.set(path, taken.get(path)!);
    }
  }
  return shared;
}

const missing: string[] = [];

function render(listed: Listed, base: string): string[] {
  const values = listed.names.filter((named) => named.kind !== "type");
  const types = listed.names.filter((named) => named.kind === "type");
  if (values.length === 0 && types.length === 0) {
    return [];
  }
  const lines = [`**${relative(base, listed.path).replaceAll("\\", "/")}**`];
  const bare: string[] = [];
  for (const named of values) {
    if (named.said === undefined) {
      if (named.kind === "value") {
        bare.push(`\`${named.name}\``);
      } else {
        missing.push(`${listed.path}: ${named.name}`);
      }
      continue;
    }
    const tag = listed.tags.get(named.name);
    const shown =
      named.kind === "function"
        ? `\`${named.name}()\``
        : tag === undefined
          ? `\`${named.name}\``
          : `\`${named.name}\`, \`<${tag}>\``;
    lines.push(`- ${shown}: ${named.said}`);
  }
  if (bare.length > 0) {
    lines.push(`- Also: ${bare.join(", ")}`);
  }
  if (types.length > 0) {
    lines.push(`- Types: ${types.map((named) => `\`${named.name}\``).join(", ")}`);
  }
  lines.push("");
  return lines;
}

// Any import of a file beside this one: named, whole, or for its side effect.
const ANY_IMPORT = /^(?:import|export)\s[^"']*?"(\.[^"]+)"/gm;
// An element the app places itself, held by no component, names its feature here.
const PLACED_BY_THE_APP: Readonly<Record<string, string>> = {
  [`${UI}/molecules/tw-token-menu.ts`]: "tokens",
  [`${UI}/molecules/tw-dash-ask.ts`]: "tokens",
  [`${UI}/atoms/tw-readout.ts`]: "rail",
};

// The UI's files by the feature they serve. A feature is a component's
// folder, or an element the app places; a file belongs to the one feature
// whose imports reach it, and to `shared` once a second feature does.
async function uiByFeature(): Promise<Map<string, string[]>> {
  const files = sourcesUnder(UI);
  const reaches = new Map<string, string[]>();
  for (const path of files) {
    const targets: string[] = [];
    for (const found of (await read(path)).matchAll(ANY_IMPORT)) {
      targets.push(posix.join(dirname(path), found[1]!).replace(/\.js$/, ".ts"));
    }
    reaches.set(path, targets);
  }
  const served = new Map<string, Set<string>>();
  const walk = (feature: string, from: string): void => {
    const features = served.get(from) ?? new Set<string>();
    if (features.has(feature)) {
      return;
    }
    features.add(feature);
    served.set(from, features);
    for (const target of reaches.get(from) ?? []) {
      walk(feature, target);
    }
  };
  for (const path of files) {
    const inComponent = /\/components\/([^/]+)\//.exec(path);
    const feature = inComponent?.[1] ?? PLACED_BY_THE_APP[path];
    if (feature !== undefined) {
      walk(feature, path);
    }
  }
  const byFeature = new Map<string, string[]>();
  for (const path of files) {
    const features = [...(served.get(path) ?? [])];
    if (features.length === 0) {
      console.error(`build-catalogue: ${path} serves no feature; a component takes it in, or`);
      console.error("  PLACED_BY_THE_APP names the feature the app places it for");
      process.exit(1);
    }
    const feature = features.length === 1 ? features[0]! : SHARED;
    byFeature.set(feature, [...(byFeature.get(feature) ?? []), path]);
  }
  return byFeature;
}

async function section(
  title: string,
  note: string | undefined,
  base: string,
  paths: readonly string[],
  only?: (named: Named, path: string) => boolean
): Promise<string[]> {
  const lines = note === undefined ? [`## ${title}`, ""] : [`## ${title}`, "", note, ""];
  for (const path of paths) {
    lines.push(...render(await list(path, only), base));
  }
  return lines;
}

// Shared first, since it is what every feature may take; the rest by name.
function inOrder(groups: ReadonlyMap<string, unknown>, first: string): string[] {
  return [...groups.keys()].sort((a, b) =>
    a === first ? -1 : b === first ? 1 : a.localeCompare(b)
  );
}

const ui = await uiByFeature();
const board = await sharedInBoard();
const boardByDomain = new Map<string, string[]>();
for (const path of board.keys()) {
  const parts = relative(BOARD, path).split(/[\\/]/);
  const domain = parts.length > 1 ? parts[0]! : SHARED;
  boardByDomain.set(domain, [...(boardByDomain.get(domain) ?? []), path]);
}
const domains = readdirSync(join(ROOT, BOARD))
  .filter((entry) => statSync(join(ROOT, BOARD, entry)).isDirectory())
  .sort();

const sections: string[] = [];
for (const feature of inOrder(ui, SHARED)) {
  sections.push(
    ...(await section(
      `UI: ${feature}`,
      feature === SHARED ? "What more than one feature takes. `packages/ui/src`." : undefined,
      UI,
      ui.get(feature)!
    ))
  );
}
for (const domain of inOrder(boardByDomain, SHARED)) {
  sections.push(
    ...(await section(
      `Board: ${domain}`,
      domain === SHARED
        ? "The `shared/` files, whole. Under each domain after this, only the names that code in another domain runs. `packages/board/src`."
        : undefined,
      BOARD,
      boardByDomain.get(domain)!,
      (named, path) => board.get(path) === "all" || (board.get(path) as Set<string>).has(named.name)
    ))
  );
}

const output = [
  "# Catalogue: what exists, before you write",
  "",
  "Written by `bun run catalogue` from the doc comments, never by hand.",
  "Grouped by feature, then file, then name; a file's folder says its",
  "layer. A UI file sits under the one feature that takes it in, and",
  "under `shared` once a second does. Look here first, then search the",
  "package, then write. [REUSE.md](REUSE.md) says why.",
  "",
  ...sections,
  "## Board: every domain",
  "",
  `Each has an \`index.ts\` naming what it offers: ${domains.map((name) => `\`${name}\``).join(", ")}.`,
  "",
].join("\n");

if (missing.length > 0) {
  console.error("build-catalogue: these shared names have no doc comment to list them by:");
  for (const name of missing) {
    console.error(`  ${name}`);
  }
  process.exit(1);
}

if (process.argv.includes("--check")) {
  const file = Bun.file(join(ROOT, OUT_PATH));
  const current = (await file.exists()) ? await file.text() : "";
  if (current !== output) {
    console.error(`build-catalogue: ${OUT_PATH} is stale; run \`bun run catalogue\``);
    process.exit(1);
  }
  console.log(`build-catalogue: ${OUT_PATH} is current`);
} else {
  await Bun.write(join(ROOT, OUT_PATH), output);
  console.log(`build-catalogue: wrote ${OUT_PATH}`);
}
