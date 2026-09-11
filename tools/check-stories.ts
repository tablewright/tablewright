// Ties docs/stories.md to the story specs: every feature with a story has
// a spec, every story a test titled with its heading, every outcome a
// step titled with its line, word for word, and nothing in a spec that
// the document does not say. Stories and lines marked *(later)* are
// intended and not yet tested, so they are exempt. Run by `bun run check`.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DOCUMENT = join(ROOT, "docs", "stories.md");
const SPECS = join(ROOT, "apps", "table", "tests");
// The marker sits at the end of a heading or a line, before its full stop.
const LATER = /\s*\*\(later\)\*\.?\s*$/;

interface Story {
  readonly title: string;
  readonly later: boolean;
  readonly outcomes: readonly { readonly text: string; readonly later: boolean }[];
}

interface Feature {
  readonly title: string;
  readonly stories: Story[];
}

// A feature's spec is its heading as a file name, articles dropped:
// "The board" is board.e2e.ts, "A player at the table" player-at-the-table.
function specOf(feature: string): string {
  const name = feature
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return join(SPECS, `${name}.e2e.ts`);
}

function parseDocument(text: string): Feature[] {
  const features: Feature[] = [];
  let feature: Feature | undefined;
  let story:
    | { title: string; later: boolean; outcomes: { text: string; later: boolean }[] }
    | undefined;
  let open: { text: string; later: boolean } | undefined;
  const close = (): void => {
    if (open !== undefined && story !== undefined) {
      const later = LATER.test(open.text);
      story.outcomes.push({ text: open.text.replace(LATER, "").trim(), later });
    }
    open = undefined;
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      close();
      story = undefined;
      feature = { title: line.slice(3).trim(), stories: [] };
      features.push(feature);
      continue;
    }
    if (line.startsWith("### ")) {
      close();
      const heading = line.slice(4).trim();
      story = {
        title: heading.replace(LATER, "").trim(),
        later: LATER.test(heading),
        outcomes: [],
      };
      feature?.stories.push(story);
      continue;
    }
    const bullet = /^\s*- (.*)$/.exec(line);
    if (bullet !== null) {
      close();
      open = { text: bullet[1] ?? "", later: false };
      continue;
    }
    if (open !== undefined && line.trim() !== "" && /^\s+\S/.test(line)) {
      open = { ...open, text: `${open.text} ${line.trim()}` };
      continue;
    }
    close();
  }
  close();
  return features;
}

// Titles as the spec source writes them: test("...") and test.step("...").
function titlesIn(source: string, call: string): string[] {
  const pattern = new RegExp(`${call.replace(".", "\\.")}\\(\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
  return [...source.matchAll(pattern)].map((match) => (match[1] ?? "").replace(/\\"/g, '"'));
}

const problems: string[] = [];
const features = parseDocument(readFileSync(DOCUMENT, "utf8"));
for (const feature of features) {
  const tested = feature.stories.filter((story) => !story.later);
  if (tested.length === 0) {
    continue;
  }
  const spec = specOf(feature.title);
  const short = spec.slice(ROOT.length + 1);
  if (!existsSync(spec)) {
    problems.push(`${feature.title}: no spec at ${short}`);
    continue;
  }
  const source = readFileSync(spec, "utf8");
  const tests = new Set(titlesIn(source, "test"));
  const steps = new Set(titlesIn(source, "test.step"));
  const wanted = new Set<string>();
  for (const story of tested) {
    if (!tests.has(story.title)) {
      problems.push(`${short}: no test for the story "${story.title}"`);
    }
    for (const outcome of story.outcomes) {
      if (outcome.later) {
        continue;
      }
      wanted.add(outcome.text);
      if (!steps.has(outcome.text)) {
        problems.push(`${short}: no step for "${outcome.text}" (${story.title})`);
      }
    }
  }
  const told = new Set(tested.map((story) => story.title));
  for (const title of tests) {
    if (!told.has(title)) {
      problems.push(`${short}: the test "${title}" is no story in ${feature.title}`);
    }
  }
  for (const title of steps) {
    if (!wanted.has(title)) {
      problems.push(`${short}: the step "${title}" is no outcome in ${feature.title}`);
    }
  }
}

if (problems.length > 0) {
  console.error("check-stories: the stories and the specs disagree");
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}
const stories = features.reduce(
  (n, feature) => n + feature.stories.filter((s) => !s.later).length,
  0
);
console.log(`check-stories: ${stories} stories match their specs`);
