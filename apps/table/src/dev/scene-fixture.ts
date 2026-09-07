// A stand-in for the core's scene document when the page runs without
// Tauri: the same tavern the core starts in, mutated in memory. The shape
// is the generated `Scene`, so the app treats both alike.

import type { Scene, Stroke, Token } from "@tablewright/schema";
import type { EntryDocument } from "@tablewright/ui";

const scene: Scene = tavern();
let nextToken = 1;

export function fixtureScene(): Scene {
  return structuredClone(scene);
}

export function fixtureMoveToken(id: string, col: number, row: number, facing: number): Scene {
  const token = scene.tokens.find((candidate) => candidate.id === id);
  if (token === undefined) {
    throw new Error(`no token ${id} in the scene`);
  }
  token.col = col;
  token.row = row;
  token.facing = facing % 360;
  return fixtureScene();
}

export function fixturePlace(entry: EntryDocument, col: number, row: number): Scene {
  const token: Token = {
    id: `tok-${nextToken}`,
    name: entry.name,
    label: initials(entry.name),
    col,
    row,
    facing: 0,
    entry: entry.id,
    visibility: "party",
  };
  nextToken += 1;
  scene.tokens.push(token);
  return fixtureScene();
}

export function fixtureRemoveToken(id: string): Scene {
  scene.tokens = scene.tokens.filter((token) => token.id !== id);
  return fixtureScene();
}

export function fixtureAddStroke(stroke: Stroke): Scene {
  // A secret threshold is the DM's, as the core makes it on adding.
  const kept: Stroke =
    stroke.ink === "threshold" && stroke.state === "secret"
      ? { ...stroke, visibility: "dm" }
      : stroke;
  scene.strokes.push(kept);
  return fixtureScene();
}

export function fixtureUndoStroke(): Scene {
  scene.strokes.pop();
  return fixtureScene();
}

function tavern(): Scene {
  const token = (id: string, label: string, col: number, row: number, facing: number): Token => ({
    id,
    name: `Token ${label}`,
    label,
    col,
    row,
    facing,
    entry: null,
    visibility: "party",
  });
  return {
    id: "tavern",
    name: "The Rusty Flagon",
    grid: { cell_size: 50, origin_x: 0, origin_y: 0, cols: 20, rows: 15 },
    map: null,
    tokens: [
      token("seed-a", "A", 4, 5, 90),
      token("seed-b", "B", 7, 6, 0),
      token("seed-c", "C", 11, 9, 315),
    ],
    strokes: [],
    display: { mode: "shaded", strength: 80 },
    next_token: 1,
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
