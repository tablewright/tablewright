# Tablewright — CLAUDE.md

Local-first virtual tabletop + worldbuilding suite. Two Tauri apps —
**Table** (VTT) and **Vault** (worldbuilder) — over one Rust core,
sharing a **Compendium** of structured game content and one unified
search. Bun + Turborepo (TS) alongside a Cargo workspace (Rust).
Design doc: [docs/design.md](../docs/design.md) (tracked; source of
truth for plans). **Private remote** at `tablewright/tablewright`: no
deploys, no publishing; never push unprompted.

## Workflow

Research → design doc → plan → execute, step by step.

1. Substantial work starts as research/discussion and lands in
   docs/design.md.
2. Plans derive from the design doc as `.plan/PLAN.<topic>.md` files —
   local-only, gitignored, checkbox per step.
3. Execute one step at a time. After each step:
   - tick the checkbox, run `bun run check`
   - **explain what was implemented, how it works, and why this
     approach over alternatives** — the user is learning the stack;
     the explanation is part of the deliverable, not a courtesy
   - stop and wait for the user to test and verify before the next step
4. Never auto-advance. Commit when a step lands or when asked; never
   push unprompted.
5. Open design decisions are surfaced as questions with options —
   never "I'd lean toward X" and ship.

## Style

See [STYLE.md](STYLE.md). Formatting is oxfmt's / rustfmt's job,
linting is oxlint's / clippy's — style review is about what tools
can't check. Tests follow [TESTING.md](TESTING.md): logic tests for
complex pure logic, and stories from `docs/stories.md` for everything
a person does.

## House rules

- Bun only — `bun add` / `bun run`; never npm or yarn.
- **Rust is the source of truth for shared types.** TS declarations
  for boundary-crossing types are generated (tauri-specta), never
  hand-written.
- **The search index is derived data** — rebuildable from the content
  stores, never the store of record.
- **Visibility (DM / party / world) is honored in every query and
  message** that leaves the DM's process; no code path assumes
  "everyone sees everything."
- `packages/ui` and `packages/board` stay Tauri-agnostic — the future
  browser player client consumes them too.
- Commits: `type(scope): short description`, subject-only, no
  trailers.

## Key paths

- `docs/design.md` — design doc (source of truth for plans)
- `docs/permissions.md` — roles, permissions and who sees what
- `docs/typography.md` — the faces, the slots and the icons
- `.ai/STYLE.md` — code style rules
- `.plan/` — local-only plans (gitignored)
- `apps/table`, `apps/vault` — Tauri shells
- `packages/schema` — generated types (never hand-edited);
  `packages/ui` — shared Lit components; `packages/board` — PixiJS
  spatial engine
- `crates/core` — entity model, vault fs, compendium store, search;
  `crates/net` — sync + assets (later)
