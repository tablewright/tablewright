// A stand-in for the core's scene library when the page runs without
// Tauri: the same tavern the core starts in, and the scenes made since,
// held in memory. The shapes are the generated types, so the app treats
// both alike.

import type { Edge, PlayState, Scene, SceneSummary, Stroke, Token } from "@tablewright/schema";
import type { EntryDocument } from "@tablewright/ui";

const scenes = new Map<string, Scene>([["tavern", tavern()]]);
let current = "tavern";
let nextToken = 1;

function open(): Scene {
  const scene = scenes.get(current);
  if (scene === undefined) {
    throw new Error(`no scene ${current} in the fixture`);
  }
  return scene;
}

export function fixtureScene(): Scene {
  return structuredClone(open());
}

export function fixtureListScenes(): SceneSummary[] {
  return [...scenes.values()]
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function fixtureOpenScene(id: string): Scene {
  if (!scenes.has(id)) {
    throw new Error(`no scene ${id} in the fixture`);
  }
  current = id;
  return fixtureScene();
}

export function fixtureCreateScene(name: string, strokes: Stroke[]): Scene {
  const base = slug(name);
  let id = base;
  for (let n = 2; scenes.has(id); n += 1) {
    id = `${base}-${n}`;
  }
  scenes.set(id, { ...blank(id, name), strokes: strokes.map(asAdded) });
  current = id;
  return fixtureScene();
}

export function fixtureMoveToken(id: string, col: number, row: number, facing: number): Scene {
  const token = open().tokens.find((candidate) => candidate.id === id);
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
  open().tokens.push(token);
  return fixtureScene();
}

export function fixtureRemoveToken(id: string): Scene {
  const scene = open();
  scene.tokens = scene.tokens.filter((token) => token.id !== id);
  return fixtureScene();
}

export function fixtureAddStroke(stroke: Stroke): Scene {
  open().strokes.push(asAdded(stroke));
  return fixtureScene();
}

export function fixtureUndoStroke(): Scene {
  open().strokes.pop();
  return fixtureScene();
}

export function fixtureSetThresholdState(edge: Edge, state: PlayState): Scene {
  const scene = open();
  const same = (candidate: Edge): boolean =>
    candidate.col === edge.col && candidate.row === edge.row && candidate.side === edge.side;
  const entry = scene.play.find((candidate) => same(candidate.edge));
  if (entry === undefined) {
    scene.play.push({ edge, state });
  } else {
    entry.state = state;
  }
  return fixtureScene();
}

export function fixtureRemoveStroke(index: number): Scene {
  const scene = open();
  if (index < 0 || index >= scene.strokes.length) {
    throw new Error(`no stroke ${index} in the scene`);
  }
  scene.strokes.splice(index, 1);
  return fixtureScene();
}

// A secret threshold is the DM's, as the core makes it on adding.
function asAdded(stroke: Stroke): Stroke {
  return stroke.ink === "threshold" && stroke.state === "secret"
    ? { ...stroke, visibility: "dm" }
    : stroke;
}

function blank(id: string, name: string): Scene {
  return {
    id,
    name,
    grid: { cell_size: 50, origin_x: 0, origin_y: 0, cols: 20, rows: 15 },
    map: null,
    tokens: [],
    strokes: [],
    display: { mode: "shaded", strength: 80 },
    play: [],
    next_token: 1,
  };
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
    ...blank("tavern", "The Rusty Flagon"),
    tokens: [
      token("seed-a", "A", 4, 5, 90),
      token("seed-b", "B", 7, 6, 0),
      token("seed-c", "C", 11, 9, 315),
    ],
  };
}

function slug(name: string): string {
  const kept = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return kept === "" ? "scene" : kept;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
