// Ties docs/stories.md to the story specs: every feature with a story has
// a spec, every story a test titled with its heading, and every outcome a
// step titled with its line, word for word, taken inside that story's own
// test and in the order the story tells them. Nothing sits in a spec that
// the document does not say. Stories and lines marked *(later)* are
// intended and not yet tested, so they are exempt. Run by `bun run check`.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DOCUMENT = join(ROOT, "docs", "stories.md");
const SPECS = join(ROOT, "apps", "table", "tests");
// The marker sits at the end of a heading or a line, before its full stop.
const LATER = /\s*\*\(later\)\*\.?\s*$/;
// A test or a step as the spec source writes it, test("...") or
// test.step("..."), and never the tail of a longer name such as latest("...").
const CALL = /(?<![\w.$])test(\.step)?\(\s*"((?:[^"\\]|\\.)*)"/g;

interface Story {
  readonly title: string;
  readonly later: boolean;
  readonly outcomes: readonly { readonly text: string; readonly later: boolean }[];
}

interface Feature {
  readonly title: string;
  readonly stories: Story[];
}

interface Step {
  readonly title: string;
  /** The test opened last above the step, or none when it comes before any. */
  readonly test: string | undefined;
}

interface Spec {
  readonly tests: readonly string[];
  readonly steps: readonly Step[];
}

// A line wraps in the document and never in a spec, so both are compared
// with their spacing collapsed.
function plain(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
      story.outcomes.push({ text: plain(open.text.replace(LATER, "")), later });
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
        title: plain(heading.replace(LATER, "")),
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

// The spec's tests and steps in the order its source gives them. A spec is
// a row of tests one after another, so a step belongs to the last test
// opened above it. Nothing here counts brackets, and nothing needs to while
// the specs keep to that shape.
function readSpec(source: string): Spec {
  const tests: string[] = [];
  const steps: Step[] = [];
  let test: string | undefined;
  for (const match of source.matchAll(CALL)) {
    const title = plain((match[2] ?? "").replace(/\\"/g, '"'));
    if (match[1] === undefined) {
      tests.push(title);
      test = title;
    } else {
      steps.push({ title, test });
    }
  }
  return { tests, steps };
}

const problems: string[] = [];
const features = parseDocument(readFileSync(DOCUMENT, "utf8"));
for (const feature of features) {
  const tested = feature.stories.filter((story) => !story.later);
  if (tested.length === 0) {
    continue;
  }
  const path = specOf(feature.title);
  const short = path.slice(ROOT.length + 1);
  if (!existsSync(path)) {
    problems.push(`${feature.title}: no spec at ${short}`);
    continue;
  }
  const spec = readSpec(readFileSync(path, "utf8"));
  // The story each outcome is filed under, which is the test its step
  // belongs in.
  const storyOf = new Map<string, string>();
  for (const story of tested) {
    for (const outcome of story.outcomes) {
      if (!outcome.later) {
        storyOf.set(outcome.text, story.title);
      }
    }
  }

  for (const story of tested) {
    if (!spec.tests.includes(story.title)) {
      problems.push(`${short}: no test for the story "${story.title}"`);
    }
    const told = story.outcomes.filter((outcome) => !outcome.later).map((o) => o.text);
    for (const text of told) {
      if (!spec.steps.some((step) => step.title === text)) {
        problems.push(`${short}: no step for "${text}" (${story.title})`);
      }
    }
    // The order is checked only among the steps that are where they belong:
    // one that is in the wrong test is reported below, and counting it here
    // as well would say the same thing twice.
    const taken = [
      ...new Set(
        spec.steps
          .filter((step) => step.test === story.title && storyOf.get(step.title) === story.title)
          .map((step) => step.title)
      ),
    ];
    const expected = told.filter((text) => taken.includes(text));
    const slip = expected.findIndex((text, index) => taken[index] !== text);
    if (slip >= 0) {
      problems.push(
        `${short}: in the test "${story.title}", "${taken[slip]}" comes before ` +
          `"${expected[slip]}", and the story has them the other way round`
      );
    }
  }

  const titled = new Set(tested.map((story) => story.title));
  for (const title of spec.tests) {
    if (!titled.has(title)) {
      problems.push(`${short}: the test "${title}" is no story in ${feature.title}`);
    }
  }
  const seen = new Set<string>();
  for (const step of spec.steps) {
    const story = storyOf.get(step.title);
    const where = step.test === undefined ? "no test at all" : `"${step.test}"`;
    if (story === undefined) {
      problems.push(`${short}: the step "${step.title}" is no outcome in ${feature.title}`);
    } else if (story !== step.test) {
      problems.push(`${short}: "${step.title}" is an outcome of "${story}" but a step of ${where}`);
    }
    const key = `${step.test ?? ""}\n${step.title}`;
    if (seen.has(key)) {
      problems.push(`${short}: "${step.title}" is a step of ${where} more than once`);
    }
    seen.add(key);
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
