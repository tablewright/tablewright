# Tablewright

Local-first virtual tabletop and worldbuilding suite. Two desktop apps
over one Rust core:

- **Table** — the VTT: Figma-smooth board, dynamic lighting and sound,
  players join from a browser link (no install).
- **Vault** — the worldbuilder: markdown lore, wiki-links, searchable.

Both share a **Compendium** of structured game content (spells, items,
bestiary) and one unified search — everything findable in seconds.

Status: pre-PoC. See [docs/design.md](docs/design.md).

## Stack

Tauri + Lit + PixiJS on a Rust core (SQLite/FTS5). Monorepo: Bun +
Turborepo for the TS side, Cargo workspace for the Rust side.

## Prerequisites

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs) via rustup, stable MSVC toolchain (required for
  Tauri and the core crates)
- Tauri OS prerequisites (WebView2 is preinstalled on Windows 10/11)

## Commands

```bash
bun install
bun run check       # format + lint + typecheck + tests + build, both languages
bun run dev:table   # run the Table app (tauri dev)
bun run tokens      # regenerate packages/ui/src/tokens.css from DESIGN.md
bun run icon:table  # regenerate the Table icon set from apps/table/assets/icon.png
bun run e2e         # Playwright end-to-end tests in Chromium and WebKit, with videos
bun run perf        # board frame-time scenarios in the installed Chrome, on the GPU
```

`bun run check` is deterministic and CI-ready; `.github/workflows/check.yml`
is drafted for the day a remote exists. End-to-end tests live in
`apps/table/tests/*.e2e.ts` and leave a video per test under
`apps/table/test-results`; run `bunx playwright install chromium webkit`
once. Frame-time numbers need a real GPU: on hosted runners the browser
renders in software, so the perf spec there gates only on a collapse.

Visual identity lives in [DESIGN.md](DESIGN.md) (the design.md
format); its front matter is the single source of the CSS tokens.
