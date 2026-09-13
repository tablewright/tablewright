/**
 * ─ build-fonts ─
 *
 * The faces the app is set in, fetched once and kept in the repo. Google
 * Fonts is asked for the latin cut of each family, the woff2 files land in
 * packages/ui/fonts, and packages/ui/src/fonts.css is generated to point at
 * them. Nothing is fetched at runtime: a table in a cellar with no signal is
 * the case tablewright is built for.
 *
 * Which face holds which slot, and why: docs/typography.md.
 *
 * `bun run fonts` refreshes everything. `--check` verifies the generated CSS
 * against the manifest and that every file it names is on disk, without
 * touching the network.
 */

const FONT_DIR = "packages/ui/fonts";
const OUT_PATH = "packages/ui/src/fonts.css";
const LICENCE_DIR = `${FONT_DIR}/licences`;

// Google serves woff2 only to a browser that says it can read one.
const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

interface Face {
  /** The family as CSS names it. */
  family: string;
  /** What is asked of the css2 API, after `family=`. */
  query: string;
  /** Where the licence for this family lives, under raw.githubusercontent.com. */
  licence: string;
  /**
   * Take every block the answer holds rather than the latin one. An icon
   * font is subset by name, so it comes back as a single unlabelled block.
   */
  whole?: boolean;
}

// Ask for the weights that exist, and for every weight that is asked of
// them. A weight a family has no file for is not an error to Google: it
// answers with the nearest one it does have, and the missing weight then
// reaches the browser as a smeared regular. Garamond is taken to 700
// because `strong` on a page is 700 and nothing was going to change that.
const FACES: Face[] = [
  {
    family: "Cinzel Decorative",
    query: "Cinzel+Decorative:wght@400;700",
    licence: "google/fonts/main/ofl/cinzeldecorative/OFL.txt",
  },
  {
    family: "EB Garamond",
    query: "EB+Garamond:ital,wght@0,400..700;1,400",
    licence: "google/fonts/main/ofl/ebgaramond/OFL.txt",
  },
  {
    family: "Libertinus Sans",
    query: "Libertinus+Sans:ital,wght@0,400;0,700;1,400",
    licence: "google/fonts/main/ofl/libertinussans/OFL.txt",
  },
  {
    family: "Fira Code",
    query: "Fira+Code:wght@400..600",
    licence: "google/fonts/main/ofl/firacode/OFL.txt",
  },
];

// Material Symbols is subset to the icons that are used and nothing else,
// which is what keeps an icon font the size of a paragraph. Add a name here
// when an icon is wanted: the file is rebuilt from this list, and so is the
// table of codepoints the app reaches them by, so a name that is not here
// does not compile. The two arrows are the ruler badge's rise and fall as
// well as the rail's, and `mode.ts` names them itself.
const ICONS = [
  "arrow_downward",
  "arrow_upward",
  "grid_on",
  "history",
  "open_with",
  "straighten",
  "undo",
  "visibility",
  "visibility_off",
];

// Which codepoint each name is at. Google keeps the list beside the font.
const CODEPOINTS =
  "https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/" +
  "MaterialSymbolsRounded%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints";
const GLYPHS_PATH = "packages/ui/src/glyphs.ts";

const MATERIAL: Face = {
  family: "Material Symbols Rounded",
  query: `Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,500,0,0&icon_names=${ICONS.join(",")}`,
  licence: "google/material-design-icons/master/LICENSE",
  whole: true,
};

/** A face as it came back: one file, and what it is set at. */
interface Cut {
  family: string;
  style: "normal" | "italic";
  weight: string;
  file: string;
}

function slug(family: string): string {
  return family.toLowerCase().replace(/\s+/g, "-");
}

function fileName(family: string, style: string, weight: string): string {
  const cut = weight.replace(/\s+/g, "-");
  return `${slug(family)}-${cut}${style === "italic" ? "-italic" : ""}.woff2`;
}

/** The cuts wanted out of a css2 answer, in the order Google listed them. */
function wantedCuts(css: string, face: Face): { weight: string; style: string; url: string }[] {
  const cuts: { weight: string; style: string; url: string }[] = [];
  // Google labels each block with the subset it covers — latin, greek,
  // symbols2 and the rest. Only latin is kept, unless the whole answer is
  // wanted.
  const blocks = [
    ...css.matchAll(/(?:\/\*\s*([a-z0-9-]+)\s*\*\/\s*)?(@font-face\s*\{[\s\S]*?\})/g),
  ];
  for (const [, subset, block = ""] of blocks) {
    if (face.whole !== true && subset !== "latin") {
      continue;
    }
    const weight = /font-weight:\s*([\d\s]+?);/.exec(block)?.[1]?.trim();
    const url = /url\((https:\/\/[^)]+)\)/.exec(block)?.[1];
    if (weight === undefined || url === undefined) {
      continue;
    }
    cuts.push({ weight, style: block.includes("italic") ? "italic" : "normal", url });
  }
  if (cuts.length === 0) {
    throw new Error(`build-fonts: ${face.family} came back with nothing wanted`);
  }
  return cuts;
}

function render(cuts: Cut[]): string {
  const lines = [
    "/* Generated from tools/build-fonts.ts. Do not edit. */",
    "",
    "/* The faces are served from the app, never fetched. `block` rather than",
    "   `swap`: the files are local, so the wait is nothing, and a swap would",
    "   flash the fallback's metrics across the board. */",
  ];
  for (const cut of cuts) {
    lines.push(
      "",
      "@font-face {",
      `  font-family: "${cut.family}";`,
      `  font-style: ${cut.style};`,
      `  font-weight: ${cut.weight};`,
      "  font-display: block;",
      `  src: url("../fonts/${cut.file}") format("woff2");`,
      "}"
    );
  }
  return `${lines.join("\n")}\n`;
}

/** The table the app reaches the icons by, written from the same list. */
async function renderGlyphs(): Promise<string> {
  const table = new Map<string, string>();
  for (const line of (await fetchText(CODEPOINTS)).split("\n")) {
    const [name, hex] = line.trim().split(" ");
    if (name !== undefined && hex !== undefined) {
      table.set(name, hex);
    }
  }
  const lines = [
    "// Generated from tools/build-fonts.ts. Do not edit.",
    "//",
    "// Material Symbols answers to the name of an icon as a ligature and to its",
    "// codepoint as a character. The codepoint is what is used: a ligature puts",
    "// the word itself in the text, which is what a screen reader then reads and",
    "// what a test then asserts on.",
    "",
    "export const GLYPH = {",
  ];
  for (const name of ICONS) {
    const hex = table.get(name);
    if (hex === undefined) {
      throw new Error(`build-fonts: Material Symbols has no icon named ${name}`);
    }
    lines.push(`  ${name}: "\\u${hex.toUpperCase()}",`);
  }
  lines.push("} as const;");
  return `${lines.join("\n")}\n`;
}

async function fetchText(url: string, asBrowser = false): Promise<string> {
  const response = await fetch(url, asBrowser ? { headers: { "User-Agent": BROWSER } } : {});
  if (!response.ok) {
    throw new Error(`build-fonts: ${url} answered ${response.status}`);
  }
  return await response.text();
}

async function collect(face: Face): Promise<Cut[]> {
  const css = await fetchText(`https://fonts.googleapis.com/css2?family=${face.query}`, true);
  const cuts: Cut[] = [];
  for (const { weight, style, url } of wantedCuts(css, face)) {
    const file = fileName(face.family, style, weight);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`build-fonts: ${face.family} file answered ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await Bun.write(`${FONT_DIR}/${file}`, bytes);
    console.log(`build-fonts: ${file} (${bytes.byteLength} bytes)`);
    cuts.push({ family: face.family, style: style as "normal" | "italic", weight, file });
  }
  const licence = await fetchText(`https://raw.githubusercontent.com/${face.licence}`);
  await Bun.write(`${LICENCE_DIR}/${slug(face.family)}.txt`, licence);
  return cuts;
}

const faces = [...FACES, MATERIAL];

if (process.argv.includes("--check")) {
  let stale = false;
  const current = (await Bun.file(OUT_PATH).exists()) ? await Bun.file(OUT_PATH).text() : "";
  for (const face of faces) {
    if (!current.includes(`font-family: "${face.family}";`)) {
      console.error(`build-fonts: ${OUT_PATH} does not set ${face.family}`);
      stale = true;
    }
    if (!(await Bun.file(`${LICENCE_DIR}/${slug(face.family)}.txt`).exists())) {
      console.error(`build-fonts: no licence kept for ${face.family}`);
      stale = true;
    }
  }
  for (const [, file] of current.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)) {
    if (!(await Bun.file(`${FONT_DIR}/${file}`).exists())) {
      console.error(`build-fonts: ${OUT_PATH} names ${file}, which is not in ${FONT_DIR}`);
      stale = true;
    }
  }
  const glyphs = (await Bun.file(GLYPHS_PATH).exists()) ? await Bun.file(GLYPHS_PATH).text() : "";
  for (const name of ICONS) {
    if (!glyphs.includes(`  ${name}: "`)) {
      console.error(`build-fonts: ${GLYPHS_PATH} does not carry ${name}`);
      stale = true;
    }
  }
  if (stale) {
    console.error("build-fonts: run `bun run fonts`");
    process.exit(1);
  }
  console.log(`build-fonts: ${OUT_PATH} is current`);
} else {
  // Swept first: a weight asked for differently comes back under a different
  // name, and the file it used to have would otherwise sit here unread.
  const { readdir, rm } = await import("node:fs/promises");
  const had = await readdir(FONT_DIR).catch(() => [] as string[]);
  for (const file of had.filter((name) => name.endsWith(".woff2"))) {
    await rm(`${FONT_DIR}/${file}`);
  }
  const cuts: Cut[] = [];
  for (const face of faces) {
    cuts.push(...(await collect(face)));
  }
  await Bun.write(OUT_PATH, render(cuts));
  await Bun.write(GLYPHS_PATH, await renderGlyphs());
  console.log(`build-fonts: wrote ${OUT_PATH} — ${cuts.length} cuts, ${faces.length} families`);
  console.log(`build-fonts: wrote ${GLYPHS_PATH} — ${ICONS.length} icons`);
}

// Top-level await requires a module; the script exports nothing.
export {};
