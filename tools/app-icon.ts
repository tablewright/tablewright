/**
 * ─ app-icon ─
 *
 * Regenerates the Table desktop icon set from apps/table/assets/icon.png.
 * The Tauri CLI writes every platform; the mobile sets are removed
 * because the desktop app never ships them. Cargo does not track the
 * icon files, only tauri.conf.json, so the config is touched afterwards
 * to make the next build embed the new icons.
 */

import { rm, utimes } from "node:fs/promises";

const APP_DIR = "apps/table";
const MASTER = "assets/icon.png";
const CONFIG = `${APP_DIR}/src-tauri/tauri.conf.json`;
const MOBILE_SETS = [`${APP_DIR}/src-tauri/icons/android`, `${APP_DIR}/src-tauri/icons/ios`];

const generate = Bun.spawnSync(["bunx", "tauri", "icon", MASTER], {
  cwd: APP_DIR,
  stdout: "inherit",
  stderr: "inherit",
});
if (generate.exitCode !== 0) {
  console.error(`app-icon: tauri icon exited with code ${generate.exitCode}`);
  process.exit(generate.exitCode);
}

for (const dir of MOBILE_SETS) {
  await rm(dir, { recursive: true, force: true });
}

const now = new Date();
await utimes(CONFIG, now, now);
console.log(`app-icon: icons regenerated from ${APP_DIR}/${MASTER}; ${CONFIG} touched`);

export {};
