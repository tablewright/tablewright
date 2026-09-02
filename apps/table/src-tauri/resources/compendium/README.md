# Bundled compendium

Generated, gitignored. `bun run seed` writes `5e-2024-srd.sqlite` here
from `systems/5e/content/2024/srd` through the Rust seeder. Tauri bundles
this directory as an app resource, and the app copies the file into its
data directory on first run.
