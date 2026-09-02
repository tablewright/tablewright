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
```

Visual identity lives in [DESIGN.md](DESIGN.md) (the design.md
format); its front matter is the single source of the CSS tokens.
