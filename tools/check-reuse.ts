// Refuses a second copy of what the repo already shares (.ai/REUSE.md).
// A table names each shared piece by what a copy of it looks like, the one
// file that writes it, and what to call instead; a file with a reason of
// its own to write the pattern is named in the row with that reason. In the
// UI package it also refuses an import that goes up a layer. When a step
// shares a piece, its row goes in here with it, so the copies cannot come
// back. Run by `bun run check`.

import { join, posix } from "node:path";
import { filesUnder } from "./files.js";

const ROOT = join(import.meta.dir, "..");
const UI = "packages/ui/src";
const BOARD = "packages/board/src";
const APP = "apps/table/src";
// Where code is written by hand. Tests and generated files are no one's copy.
const SCANNED = [UI, BOARD, APP];
const PAGES = ["apps/table/index.html"];
const READ = /\.(?:ts|css|html)$/;

interface Row {
  /** What a copy is, as a refusal says it. */
  readonly what: string;
  /** What a copy looks like in the source. */
  readonly pattern: RegExp;
  /** The one file that writes it. */
  readonly home: string;
  /** What to use instead. */
  readonly instead: string;
  /** The folders the row holds for; everywhere scanned when it names none. */
  readonly within?: readonly string[];
  /** Files with a reason of their own to write it, each with the reason. */
  readonly excused?: Readonly<Record<string, string>>;
}

const TABLE: readonly Row[] = [
  {
    what: "an event dispatched by hand",
    pattern: /new CustomEvent\(/,
    home: `${UI}/utils/events.ts`,
    instead: "`emit()`",
  },
  {
    what: "a focus ring written by hand",
    pattern: /outline:[^;\n]*--tw-focus-ring/,
    home: `${UI}/atoms/styles.ts`,
    instead: "`FOCUS_RING`, or `FOCUS_OUTLINE` inside a rule of its own",
    excused: {
      "apps/table/index.html":
        "the page's own stylesheet is plain CSS, which no Lit fragment reaches",
    },
  },
  {
    what: "an element measured by hand",
    pattern: /getBoundingClientRect\(/,
    home: `${BOARD}/geometry.ts`,
    instead: "`pointOn()` for where a pointer landed",
    within: [BOARD],
    excused: {
      [`${BOARD}/camera/camera-input.ts`]:
        "reads the target's height, to turn a wheel's lines and pages into pixels",
      [`${BOARD}/tokens/token-layer.ts`]:
        "measures the canvas once at the press, so a drag reads no layout on each move",
    },
  },
  {
    what: "a set of listeners kept by hand",
    pattern: /\bSet<(?:[^\n>]*Listener|\([^\n)]*\)\s*=>)/,
    home: `${BOARD}/stage/listeners.ts`,
    instead: "`Listeners`",
  },
  {
    what: "a line dashed by a loop of its own",
    pattern: /\+=\s*\w*dash\w*\s*\+\s*\w*gap/i,
    home: `${BOARD}/draw/strokes.ts`,
    instead: "`dashedLine()`",
  },
  {
    what: "a typing target tested by hand",
    pattern: /\.matches\(\s*["'`]input,\s*textarea/,
    home: `${BOARD}/tokens/press.ts`,
    instead: "`isTypingTarget()`",
  },
  {
    what: "an error's reason read out by hand",
    pattern: /instanceof Error \? \w+\.message : String\(/,
    home: `${APP}/shell/notice.ts`,
    instead: "`reasonOf()`",
    within: [APP],
  },
  {
    what: "a failure caught and said by hand",
    pattern: /void \(async \(\) => \{\s*try \{/,
    home: `${APP}/shell/notice.ts`,
    instead: "`attempt()`",
    excused: {
      [`${APP}/parts/scene.ts`]:
        "a move the core refuses is said, and then the scene is shown as it stands",
    },
  },
  {
    what: "the desktop app asked after by hand",
    pattern: /__TAURI_INTERNALS__/,
    home: `${APP}/core/core.ts`,
    instead: "`IS_DESKTOP`",
  },
  {
    what: "the default height display written out",
    pattern: /mode:\s*"shaded",\s*strength:/,
    home: `${BOARD}/topology/height-layer.ts`,
    instead: "`DEFAULT_DISPLAY`",
  },
  {
    what: "a scene's starting grid written out",
    pattern: /cols:\s*20,\s*rows:\s*15/,
    home: `${APP}/host/board-host.ts`,
    instead: "the host's `clearScene()`",
    excused: {
      [`${APP}/dev/campaign-fixture.ts`]:
        "stands in for the core's `Scene::blank`, which no TypeScript can call",
    },
  },
];

// What each layer of the UI package may take in (.ai/REUSE.md): imports go
// down the list, never up. A component also takes what is in its own folder.
const LAYERS: Readonly<Record<string, readonly string[]>> = {
  utils: ["utils"],
  atoms: ["atoms", "utils"],
  molecules: ["molecules", "atoms", "utils"],
  components: ["molecules", "atoms", "utils"],
};
const IMPORT = /^(?:import|export)\s[^;]*?from\s+"(\.[^"]+)"|^import\s+"(\.[^"]+)"/gm;

const problems: string[] = [];
const paths = [
  ...SCANNED.flatMap((folder) => filesUnder(ROOT, folder).filter((path) => READ.test(path))),
  ...PAGES,
];
const texts = new Map<string, string>();
for (const path of paths) {
  texts.set(path, await Bun.file(join(ROOT, path)).text());
}

function lineOf(text: string, at: number): number {
  return text.slice(0, at).split("\n").length;
}

for (const row of TABLE) {
  const excused = row.excused ?? {};
  // A row is only as good as the places it names: a home that no longer
  // writes the pattern guards nothing, and an excuse nothing needs is a hole.
  for (const named of [row.home, ...Object.keys(excused)]) {
    const text = texts.get(named);
    if (text === undefined || !row.pattern.test(text)) {
      problems.push(`${named}: named in the row for ${row.what}, and does not write it`);
    }
  }
  for (const [path, text] of texts) {
    const isHeld = row.within === undefined || row.within.some((f) => path.startsWith(`${f}/`));
    if (!isHeld || path === row.home || path in excused) {
      continue;
    }
    const found = row.pattern.exec(text);
    if (found !== null) {
      problems.push(
        `${path}:${lineOf(text, found.index)}: ${row.what}; use ${row.instead} from ${row.home}`
      );
    }
  }
}

// The layer a UI file sits in, and for a component the folder that is its own.
function placeOf(path: string): { layer: string; own: string } {
  const [layer = "", own = ""] = posix.relative(UI, path).split("/");
  return { layer, own };
}

for (const [path, text] of texts) {
  const from = placeOf(path);
  const allowed = path.startsWith(`${UI}/`) ? LAYERS[from.layer] : undefined;
  // The package's root, its barrel and stylesheets, takes anything.
  if (allowed === undefined) {
    continue;
  }
  for (const found of text.matchAll(IMPORT)) {
    const target = posix.join(posix.dirname(path), found[1] ?? found[2] ?? "");
    const to = placeOf(target);
    const isOwn = from.layer === "components" && to.layer === "components" && to.own === from.own;
    if (!isOwn && !allowed.includes(to.layer)) {
      problems.push(
        `${path}:${lineOf(text, found.index)}: ${from.layer} takes ${to.layer || "the package's root"}, ` +
          `which is not below it (${posix.relative(UI, target)})`
      );
    }
  }
}

if (problems.length > 0) {
  console.error("check-reuse: a copy of something shared, or an import that goes up a layer");
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}
console.log(
  `check-reuse: ${paths.length} files hold no copy of the ${TABLE.length} shared pieces, ` +
    "and no import goes up a layer"
);
