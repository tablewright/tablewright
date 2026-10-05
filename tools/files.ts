// What the tools share for reading the repo's files.

import { readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Every file under `folder`, as paths from `root` with forward slashes. A
 * folder's entries come in name order, and a folder among them is walked
 * where its name falls.
 */
export function filesUnder(root: string, folder: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, folder)).sort()) {
    const path = posix.join(folder, entry);
    if (statSync(join(root, path)).isDirectory()) {
      found.push(...filesUnder(root, path));
    } else {
      found.push(path);
    }
  }
  return found;
}
