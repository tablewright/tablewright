# Tablewright

A local-first virtual tabletop and worldbuilding suite: two desktop
apps over one Rust core.

- **Table**: the virtual tabletop. A board of tokens, walls, heights,
  measurement and templates, with lighting, sound and players joining
  from a browser link still to come.
- **Vault**: the worldbuilder, for markdown lore with wiki-links. Not
  built out yet.

Both share a **Compendium** of game content (spells, items, a
bestiary) and one search across all of it.

Status: proof of concept, in progress. The design is
[docs/design.md](docs/design.md).

## Stack

Tauri, Lit and PixiJS on a Rust core with SQLite and FTS5. Bun and
Turborepo run the TypeScript side, and a Cargo workspace the Rust side.

## Prerequisites

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs) through rustup, with the stable MSVC
  toolchain
- Tauri's OS prerequisites (WebView2 comes with Windows 10 and 11)

## Commands

```bash
bun install
bun run check       # format, lint, typecheck, tests and build, both languages
bun run dev:table   # run the Table app
bun run tokens      # regenerate packages/ui/src/tokens.css from DESIGN.md
bun run fonts       # rebuild the bundled fonts and packages/ui/src/atoms/glyphs.ts
bun run catalogue   # rewrite .ai/CATALOGUE.md, the shared names, from the doc comments
bun run import:srd  # rebuild systems/5e/content/2024/srd from Open5e, cached in data/srd
bun run seed        # write the bundled compendium database from systems/ (gitignored)
bun run schema      # regenerate packages/schema/src/bindings.ts from the Rust commands
bun run icon:table  # regenerate the Table icon set from apps/table/assets/icon.png
bun run e2e         # the stories in Chromium, capped to a quarter of the processor
bun run perf        # board frame times in the installed Chrome, on the graphics card
```

CI runs `.github/workflows/ci.yml` on every push and pull request to
`main` and `develop`. The stories live in `apps/table/tests/*.e2e.ts`
and keep a trace when one fails; `e2e:all` in `apps/table` adds
WebKit. Run `bunx playwright install chromium webkit` once. Frame times
need a real graphics card: on hosted runners the browser draws in
software, so the perf spec there fails only on a collapse.

The visual identity is [DESIGN.md](DESIGN.md), whose front matter is
the one source of the CSS tokens.
