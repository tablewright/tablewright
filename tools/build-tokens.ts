/**
 * ─ build-tokens ─
 *
 * DESIGN.md front matter to CSS custom properties. Reads the YAML at the
 * top of DESIGN.md and writes packages/ui/src/tokens.css with every token
 * as a `--tw-*` property; component values that reference other tokens
 * become `var(--tw-*)`. DESIGN.md is the source of truth and the CSS is
 * generated output, never edited by hand. `--check` verifies instead.
 */

const SOURCE_PATH = "DESIGN.md";
const OUT_PATH = "packages/ui/src/tokens.css";
const PREFIX = "--tw";

type Primitive = string | number;

interface Frontmatter {
  colors?: Record<string, string>;
  typography?: Record<string, Record<string, Primitive>>;
  spacing?: Record<string, Primitive>;
  rounded?: Record<string, Primitive>;
  components?: Record<string, Record<string, Primitive>>;
}

// Where each token group lands in CSS: `{spacing.sm}` becomes `var(--tw-space-sm)`.
const GROUP_PREFIX: Record<string, string> = {
  colors: "",
  spacing: "space-",
  rounded: "rounded-",
  typography: "typo-",
};

function toKebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

// Multi-word family names need quotes; generic families and single words do not.
function formatFontFamily(value: string): string {
  return value
    .split(",")
    .map((raw) => {
      const name = raw.trim();
      return /^[A-Za-z][A-Za-z0-9-]*$/.test(name) ? name : `"${name}"`;
    })
    .join(", ");
}

function varName(group: string, token: string, suffix = ""): string {
  return `${PREFIX}-${GROUP_PREFIX[group] ?? `${group}-`}${token}${suffix}`;
}

function parseReference(value: Primitive): { group: string; token: string } | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /^\{([a-z]+)\.([A-Za-z0-9-]+)\}$/.exec(value);
  if (match === null) {
    return undefined;
  }
  return { group: match[1] ?? "", token: match[2] ?? "" };
}

function componentLines(component: string, props: Record<string, Primitive>): string[] {
  const lines: string[] = [];
  for (const [prop, value] of Object.entries(props)) {
    const ref = parseReference(value);
    const name = `${PREFIX}-comp-${component}-${toKebab(prop)}`;
    if (ref === undefined) {
      lines.push(`  ${name}: ${String(value)};`);
    } else if (ref.group === "typography") {
      // A typography reference expands to the properties a rule can use directly.
      for (const typoProp of ["font-family", "font-size", "font-weight", "line-height"]) {
        lines.push(
          `  ${PREFIX}-comp-${component}-${typoProp}: var(${varName("typography", ref.token, `-${typoProp}`)});`
        );
      }
    } else {
      lines.push(`  ${name}: var(${varName(ref.group, ref.token)});`);
    }
  }
  return lines;
}

function render(fm: Frontmatter): string {
  const lines: string[] = [
    "/* Generated from DESIGN.md by tools/build-tokens.ts. Do not edit. */",
    "",
    ":root,",
    '[data-theme="dark"] {',
    `  ${PREFIX}-theme-name: dark;`,
    "",
  ];
  const group = (title: string, entries: string[]): void => {
    if (entries.length === 0) {
      return;
    }
    lines.push(`  /* ${title} */`, ...entries, "");
  };

  group(
    "Colors",
    Object.entries(fm.colors ?? {}).map(
      ([name, value]) => `  ${varName("colors", name)}: ${value};`
    )
  );
  group(
    "Spacing",
    Object.entries(fm.spacing ?? {}).map(
      ([name, value]) => `  ${varName("spacing", name)}: ${String(value)};`
    )
  );
  group(
    "Rounded",
    Object.entries(fm.rounded ?? {}).map(
      ([name, value]) => `  ${varName("rounded", name)}: ${String(value)};`
    )
  );
  group(
    "Typography",
    Object.entries(fm.typography ?? {}).flatMap(([name, props]) =>
      Object.entries(props).map(([prop, value]) => {
        const css = prop === "fontFamily" ? formatFontFamily(String(value)) : String(value);
        return `  ${varName("typography", name, `-${toKebab(prop)}`)}: ${css};`;
      })
    )
  );
  group(
    "Components",
    Object.entries(fm.components ?? {}).flatMap(([name, props]) => componentLines(name, props))
  );

  lines.push("}", "");
  return lines.join("\n");
}

const source = await Bun.file(SOURCE_PATH).text();
const frontMatter = /^---\r?\n([\s\S]+?)\r?\n---/.exec(source);
if (frontMatter === null) {
  console.error(`build-tokens: ${SOURCE_PATH} has no YAML front matter`);
  process.exit(1);
}
const output = render(Bun.YAML.parse(frontMatter[1] ?? "") as Frontmatter);

if (process.argv.includes("--check")) {
  const current = (await Bun.file(OUT_PATH).exists()) ? await Bun.file(OUT_PATH).text() : "";
  if (current !== output) {
    console.error(`build-tokens: ${OUT_PATH} is stale; run \`bun run tokens\``);
    process.exit(1);
  }
  console.log(`build-tokens: ${OUT_PATH} is current`);
} else {
  await Bun.write(OUT_PATH, output);
  console.log(`build-tokens: wrote ${OUT_PATH}`);
}
