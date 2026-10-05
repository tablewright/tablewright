# Builder — Tablewright

The brief a building agent starts from. A thread that works through a
plan hands one step to a builder, reads the diff by hand afterwards,
and answers to the user for it. The builder builds that one step and
reports. The paths are this repo's; the rules are the house's and
travel to the other repos as they are.

Where this brief and CLAUDE.md's workflow differ, the brief is the
builder's. Ticking the box, explaining the step to the user and the
commit belong to the thread that sent you.

## Read first

You start knowing nothing of the repo, or of the talk behind the step.
Read these whole before a line is written:

- [CLAUDE.md](CLAUDE.md) for the house rules, then
  [STYLE.md](STYLE.md), [TESTING.md](TESTING.md) and
  [REUSE.md](REUSE.md).
- [CATALOGUE.md](CATALOGUE.md), the shared names. What the step needs
  may be in it already.
- The step you were given, in the plan file named: its own text, the
  plan's section on how a step runs, the Done notes of the steps near
  it, and any review the step points to.
- The code the step touches, and the part of `docs/` it rests on.
- What `git status` shows. The tree may hold work that is not yours,
  and that work is left as it is.

## Build

- Build the step and nothing else. What looks wrong outside it goes in
  the report, never in the diff.
- Look before you write, as REUSE.md says: the catalogue, then a
  search of the package for the verb and the noun. What nearly fits is
  changed to fit both uses, never copied.
- A step that calls itself a move is a move. Lines leave one file for
  another and import paths follow. Nothing is renamed, reworded or
  tidied on the way. Each file comes out shorter, and the total grows
  by no more than the imports and exports the move needs; say so in
  the report if it grows by more.
- Any other step is built in this order: the pure logic with its logic
  test, run by `bun test` in its package; then the layer or the
  element; then the wiring; then the lines in `docs/stories.md`, each
  with its `test.step()` in the feature's spec, titled with the line
  word for word. The spec is written and left unrun.
- A test checks an attribute, the state the app holds or an error's
  kind. It never checks wording.
- A piece this step shares gets its row in `tools/check-reuse.ts`, and
  its copies are deleted in the same change. When a file that table
  names is moved, its row follows it.
- An exported name's doc comment opens with one plain sentence. Run
  `bun run catalogue` when a shared name is added, moved or reworded.
- Small calls are yours, and the report names them. A choice that
  changes what a person sees, or what a later step builds on, is not.
  Build what does not hang on it, leave the tree as it stands, and put
  the question, with its options, at the head of the report.

## Check

- `bun run format` first. Then the parts of `bun run check`, one at a
  time in the order `package.json` chains them, stopping before
  `check:rust`. Its `turbo run check` is `bun x turbo run check` from
  a shell, and runs each package's types and logic tests.
- Never `bun run check` whole: it ends in the Rust checks, with
  nothing holding them.
- Rust is checked only when the step touches Rust, and whatever runs
  cargo is held to a share of the machine:
  `bun run tools/capped.ts bun run check:rust`, and the same in front
  of `bun run schema`.
- Every check passes before you report, or the report says which did
  not and why. A check that fails on a file the step never touched, or
  a format that rewrites one, is reported, not fixed and not worked
  around.

## Never

- Never run a story: no `e2e` script, no Playwright, no perf run. A
  story takes minutes of the machine, so the person sitting at it
  decides when one runs. Name the stories that would prove the change,
  by title, in the report.
- Never start the app, a dev server or a browser.
- Never commit, stage, stash, switch branch or push. The work stays in
  the tree, where the thread that sent you reads it.
- Never write in the plan. Its Done note is written from your report.
- Never edit by hand a file that says at its top a tool wrote it.
  It names the tool there; run the tool.
- Never add a dependency, and never leave a notes or planning file
  behind.

## Report

The report is all that the thread which sent you sees of the work, and
the person it is passed on to is learning the stack. In this order:

1. What was built, file by file: how it works, and why this way over
   the alternatives.
2. The numbers, against the tree as you found it and with new files
   counted: lines in and lines out, and for a move each file's length
   before and after.
3. Each check that ran and what it said, and any that did not run,
   with the reason.
4. The stories that would prove the change, by title.
5. The small calls made, the questions, and what was seen outside the
   step.
6. The reuse reading, last: what was looked for, what was reused, and
   what was looked for and not found. "Nothing to reuse" is an answer.
   Saying nothing is not.
