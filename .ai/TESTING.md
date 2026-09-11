# Testing — Tablewright

How a change proves itself. The paths are this repo's; the rules are
the house's and travel to the other repos as they are. Code style is
in [STYLE.md](STYLE.md).

## Two kinds of test, and only two

- **Logic tests** for complex pure logic, in the language it lives
  in: `cargo test` for the core, `bun test` for the board's rules and
  geometry and the search. Test these hard. They run in milliseconds
  and never lie.
- **Stories** for everything a person does with the app. A story is
  one thing a person sets out to do, and what they see along the way.
  Stories are the integration tests. There are no component tests,
  nothing is pixel-perfect, and no key, flag or component gets a spec
  of its own. A key press can be an outcome in a story; it is never a
  story.

## The stories document

- `docs/stories.md`, beside the design doc. The design says why, the
  stories say what someone does and sees, the plan says when.
- `##` per feature, `###` per story, one outcome per line, nested
  lines for outcomes within an outcome. Headings are the ids; nothing
  is numbered, so a story can be added between two others.
- A story marked *(later)* is intended and not yet tested. The
  document may run ahead of the plan; it never claims a test it does
  not have.
- Written in plain English in the actor's world: what they do and
  what they see, in the words the step will carry. The domain's names
  are used as they are.

## The base

- Every story starts from one known state, the base, and assumes
  nothing else: here, the example campaign as the first run makes
  it, the tavern with three tokens, the mansion and the hill as
  scenes, and the fixture compendium. The base is the same on a
  laptop and in CI.
- A story sets up nothing of its own. What it needs beyond the base,
  it does in its first steps, in the open, as a person would.
- A reset is a page load. In the browser stand-in the base lives in
  memory per page, so a load is a fresh base. With the real core
  behind the page, a Playwright worker fixture starts one core over a
  temporary home copied from the base, and a load resets the page;
  a story that needs a clean core mid-way asks the fixture for one.
- Steps in a story share the page and build on each other. A story
  that would need two resets is two stories.

## From story to test

- One spec per feature, `tests/<feature>.e2e.ts`. One `test()` per
  story, titled with the story's heading. One `test.step()` per
  outcome, titled with the line, word for word. A nested line is a
  nested step.
- A story runs on one page load. Its steps share the page and read
  what the user would read: what is shown, and what the record holds.
  Never how a component is built.
- Write the outcome line first, then the step. A regression is a new
  line in the story it belongs to, never a test of its own.
- A checker in `check` ties the document to the specs: an outcome
  with no step, or a step with no outcome, fails the build. Stories
  marked *(later)* are exempt.

## Budgets

- Frame and timing budgets are not stories. They live in their own
  project, `perf.e2e.ts` behind `e2e:perf`, run on demand on a
  machine with a GPU, and report numbers a person reads. A budget
  guards against a change in complexity, not a slow afternoon, so it
  sits an order of magnitude above the measured cost.

## Speed

- `check` runs in seconds; keep it so. Stories are the one slow part.
  They share nothing, so they run in parallel, in one browser engine
  by default, the others on request.
- While working: one story, one engine. Before a commit: every story.

## What a story cannot see

- A story drives the page. Where a stand-in serves the page in place
  of the real core, the seam between them is where a bug can still
  hide. Name the seam in the stories document, and close it when it
  bites.
