// Writes .ai/CATALOGUE.md: the shared names of the packages, each with
// the sentence its doc comment opens on, so a session starts knowing what
// exists before it writes anything (.ai/REUSE.md). Listed are the UI's
// atoms, molecules and utils, its components by element, and the board's
// root files with the names a second domain runs. A listed
// function or class with no doc comment fails the run, so the sentence
// gets written; a constant without one is listed by its name, which is
// all STYLE.md asks of a constant. `--check` refuses a stale file; run by
// `bun run check`.

import { readdirSync, statSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const OUT_PATH = ".ai/CATALOGUE.md";
const UI = "packages/ui/src";
const BOARD = "packages/board/src";
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

function filesUnder(folder: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(ROOT, folder)).sort()) {
    const path = posix.join(folder, entry);
    if (statSync(join(ROOT, path)).isDirectory()) {
      found.push(...filesUnder(path));
    } else if (entry.endsWith(".ts") && entry !== "index.ts" && !SKIPPED.has(path)) {
      found.push(path);
    }
  }
  return found;
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

// What the board shares, by file: every name of a root file, and of a
// domain's file the names that code in another domain runs. A type
// borrowed is a shape, not a use, so type imports do not count.
async function sharedInBoard(): Promise<Map<string, Set<string> | "all">> {
  const files = filesUnder(BOARD);
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
    if (domainOf(path) === "") {
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

async function section(
  title: string,
  note: string,
  base: string,
  paths: string[],
  only?: (named: Named, path: string) => boolean
) {
  const lines = [`## ${title}`, "", note, ""];
  for (const path of paths) {
    lines.push(...render(await list(path, only), base));
  }
  return lines;
}

const board = await sharedInBoard();
const domains = readdirSync(join(ROOT, BOARD))
  .filter((entry) => statSync(join(ROOT, BOARD, entry)).isDirectory())
  .sort();

const output = [
  "# Catalogue: what exists, before you write",
  "",
  "Written by `bun run catalogue` from the doc comments, never by hand. It",
  "lists what is shared, not everything: look here first, then search the",
  "package, then write. [REUSE.md](REUSE.md) says why.",
  "",
  ...(await section(
    "UI atoms",
    "One control or one look, knowing nothing of the domain. `packages/ui/src/atoms`.",
    `${UI}/atoms`,
    filesUnder(`${UI}/atoms`)
  )),
  ...(await section(
    "UI molecules",
    "A few atoms with one purpose, owning no flow. `packages/ui/src/molecules`.",
    `${UI}/molecules`,
    filesUnder(`${UI}/molecules`)
  )),
  ...(await section(
    "UI utils",
    "No elements. `packages/ui/src/utils`.",
    `${UI}/utils`,
    filesUnder(`${UI}/utils`)
  )),
  ...(await section(
    "UI components",
    "The pieces of the screen, by element; what only one of them uses is in its folder. `packages/ui/src/components`.",
    `${UI}/components`,
    filesUnder(`${UI}/components`),
    (named) => named.kind === "class"
  )),
  ...(await section(
    "Board, shared",
    "The root files, and from each domain the names that code in another domain runs. `packages/board/src`.",
    BOARD,
    [...board.keys()],
    (named, path) => board.get(path) === "all" || (board.get(path) as Set<string>).has(named.name)
  )),
  "## Board, by domain",
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
