# Bundled compendium

Generated, gitignored. `bun run seed` writes `5e-srd.sqlite` here from
every bundled 5e module under `systems/5e/content` (the 2024 SRD, the 2014
SRD, the 2014 conditions) through the Rust seeder, one file for both rule
versions. Tauri bundles this directory as an app resource, and the app
copies the file into its data directory on first run, or again when the
bundled file changes.
