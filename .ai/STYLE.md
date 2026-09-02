# Style Guide — Tablewright

The Tauri-suite adaptation of the house style: questboard's guide is
the parent for the TS/Rust split; comment rules follow izelya.me's
refinement. Where they disagree, this file governs.

## Principles (all languages)

- Readability over cleverness; start simple, earn complexity — don't
  abstract until there's a second use case.
- Prefer classes where the language supports them well (Lit components
  are classes); pure logic modules may stay plain functions.
- **Split files early.** One concern per file. ~250 lines: look for a
  sensible seam; ~400: finding one is a priority. Judgment thresholds,
  not lint rules. Tests and scripts exempt.
- Minimal dependencies. Planned runtime deps: `lit`, `pixi.js`,
  `tauri` (+ plugins), `rusqlite`. Any further dependency needs a
  strong written case; the default answer is no.
- One dev/prod switch per layer, provided by the toolchain:
  `cfg!(debug_assertions)` in Rust; a single build-time define in TS.
  No runtime environment sniffing.
- No emoji in technical writing.

## Comments

- Comments exist for exactly three reasons: intent of a file or
  function; reference for new maintainers; explaining genuinely
  complex code. Never narrate what the code says, never reference
  plans/chats from shipped text — the comment carries the reasoning
  itself.
- Plain English: common words, short declarative sentences, active
  voice. State the constraint or the reason and stop. One sentence is
  the default; a second earns its place by carrying a why.
- Domain vocabulary is not waffle — envelope, compendium, scene,
  emitter, visibility tier are the system's real names; use them.
- Non-obvious modules open with an intent preamble: bare `/**` opener,
  a `─ title ─` line, a blank gutter line, tapered prose, `*/` on its
  own line, max ~6 prose lines, ending on the design-doc reference.
  Trivial modules get nothing. Rust uses `//!` module docs to the same
  standard.
- Constants carry inline rationale where the value isn't self-evident.
- Box-drawing section dividers (`// ── Section ──`) available for
  long files.

## TypeScript (UI, board, app shells)

- TypeScript strict, plus `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `isolatedModules`. No `any`.
- Lint: **oxlint** (oxc + unicorn plugins) — `eqeqeq`, `no-var`,
  `prefer-const`, `object-shorthand`, `curly`, `no-else-return`,
  `no-lonely-if`; unused vars error unless `_`-prefixed.
- Format: **oxfmt** — 100 cols, 2-space, semicolons, double quotes,
  `trailingComma: es5`, `arrowParens: always`, LF.
- JSDoc on exported APIs: prose purpose plus the tags the type alone
  doesn't carry. Non-exported functions need none.
- Private class members use the `private` keyword, not `_` prefix.
- Explicit `.js` extensions on relative imports; barrel `index.ts`
  per feature.
- Guard at the boundary; early returns; no defensive re-checks deep
  inside.
- **The TS layer stays thin.** Domain logic — content model, search,
  visibility, sync — lives in Rust; TS does UI, rendering, and glue.
  Domain logic lives in exactly one place so copies can't drift.
- Visual state is state-driven: CSS custom properties + attribute
  selectors, never inline `el.style.*` writes for visual state
  (geometry positioning from the board's camera applier is exempt).

## Rust (core: content model, search, storage; net later)

- `rustfmt` defaults; `cargo clippy -- -D warnings` clean.
- Library code returns `Result`; no `panic!`/`unwrap` outside tests
  and provably-infallible cases (comment the proof).
- Error enums per module (`thiserror`-style), never stringly-typed.
- Public API gets `///` doc comments: prose purpose plus `# Errors` /
  `# Examples` / `# Panics` where applicable.
- `unsafe` requires a justification comment; expected count: zero.
- Unit tests in `#[cfg(test)] mod tests` in the same file; integration
  tests in the crate's `tests/`.
- Naming: standard Rust (snake_case items, PascalCase types,
  SCREAMING_SNAKE consts).
- **Shared types have one source of truth: Rust.** Boundary-crossing
  TS declarations are generated (tauri-specta), never hand-written.

## Naming (TS)

| Thing                 | Convention                  | Example            |
| --------------------- | --------------------------- | ------------------ |
| Files                 | `kebab-case`                | `scene-camera.ts`  |
| Variables / functions | `camelCase`                 | `snapToGrid`       |
| Classes / components  | `PascalCase`                | `BoardStage`       |
| Constants             | `SCREAMING_SNAKE_CASE`      | `GRID_CELL_PX`     |
| Booleans              | `is` / `has` / `can` prefix | `isRevealed`       |
| Collections           | plural noun                 | `emitters`         |
| Git branches          | `type/short-description`    | `feat/ruler-tool`  |

## Tests

- Runner: `bun test` (TS), `cargo test` (Rust); TS tests in top-level
  `tests/` per package, named `<feature>.test.ts`.
- Test behavior, not implementation; unit-test pure logic hard (the
  core is almost all pure logic), integration-test the rest.
- DOM- or canvas-bound code is never DOM-emulated: extract the math
  into a pure module, test that, verify real rendering in the app.
- Names describe the scenario: `"cone template covers the origin
  cell's far edge"`.
- No mocks unless hitting a real external service.

## Tooling

- Bun as package manager / runner; Turborepo orchestrates tasks;
  cargo rides through package scripts so `bun run check` covers both
  languages.
- `check` = format:check + lint + typecheck + tests + build (TS) plus
  `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`.
- Generated files (`packages/schema/*`) are never hand-edited.

## Commits

- `type(scope): short description` — `feat`, `fix`, `refactor`,
  `docs`, `chore`, `test`, `style`, `perf`, `ci`, `revert`; present
  tense, imperative; subject-only, no trailers.

## Error Handling (user-facing)

- Say what went wrong, what was received, what was expected, and what
  the user can do about it.
- Typed errors / error codes for programmatic handling; never swallow
  silently.
- State names over spinners: degraded states are named and visible,
  never mystery blanks or blocked actions.
