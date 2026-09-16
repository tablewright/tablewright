# Bundled compendium

Generated and gitignored. `bun run seed` writes `5e-srd.sqlite` here
through the Rust seeder, from every bundled 5e module under
`systems/5e/content` (the 2024 SRD, the 2014 SRD and the 2014
conditions), one file for both rule versions. Tauri bundles this
directory, and the app copies the file into its data directory on first
run, or again when the bundled file changes.
