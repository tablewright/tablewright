// A stand-in for the core when the page runs without Tauri: the example
// campaign the first run makes, the tavern with the mansion and the hill,
// and the campaigns made since, held in memory with their scenes. The
// shapes are the generated types, so the app treats both alike.

import { REFERENCE_SCENES } from "@tablewright/board";
import type {
  Visibility,
  CampaignSummary,
  Edge,
  HeightDisplay,
  MapImage,
  PlayState,
  Scene,
  SceneSummary,
  Stroke,
  Token,
} from "@tablewright/schema";
import type { EntryDocument } from "@tablewright/ui";

interface Campaign {
  summary: CampaignSummary;
  scenes: Map<string, Scene>;
  current: string;
  nextToken: number;
}

// Where the campaigns would be on a machine: the path is shown on the
// intro, never opened, under plain Vite.
const HOME = "Documents/Tablewright/campaigns";

const campaigns = new Map<string, Campaign>();
let open: string | undefined;

seed();

// The example as the first run makes it: the tavern, then the mansion and
// the hill from their reference drawings, open on the tavern.
function seed(): void {
  const example = create("The Rusty Flagon", HOME);
  for (const reference of REFERENCE_SCENES) {
    addScene(example, reference.name, reference.strokes());
  }
  example.current = "tavern";
  open = example.summary.path;
}

// ── Campaigns ──

export function fixtureListCampaigns(): CampaignSummary[] {
  return [...campaigns.values()]
    .map((campaign) => ({ ...campaign.summary }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function fixtureCurrentCampaign(): CampaignSummary | null {
  return open === undefined ? null : { ...session().summary };
}

export function fixtureOpenCampaign(path: string): CampaignSummary {
  if (!campaigns.has(path)) {
    throw new Error(`${path}: not a campaign in the fixture`);
  }
  open = path;
  return { ...session().summary };
}

export function fixtureCreateCampaign(name: string, location: string | null): CampaignSummary {
  const campaign = create(name, location ?? HOME);
  open = campaign.summary.path;
  return { ...campaign.summary };
}

export function fixtureCloseCampaign(): void {
  open = undefined;
}

// ── The scene ──

export function fixtureScene(): Scene {
  return structuredClone(scene());
}

export function fixtureListScenes(): SceneSummary[] {
  return [...session().scenes.values()]
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function fixtureOpenScene(id: string): Scene {
  const campaign = session();
  if (!campaign.scenes.has(id)) {
    throw new Error(`no scene ${id} in the fixture`);
  }
  campaign.current = id;
  return fixtureScene();
}

export function fixtureCreateScene(name: string, strokes: Stroke[]): Scene {
  addScene(session(), name, strokes);
  return fixtureScene();
}

export function fixtureMoveToken(id: string, col: number, row: number, facing: number): Scene {
  const token = scene().tokens.find((candidate) => candidate.id === id);
  if (token === undefined) {
    throw new Error(`no token ${id} in the scene`);
  }
  token.col = col;
  token.row = row;
  token.facing = facing % 360;
  return fixtureScene();
}

/** Mark who may see a token, as the core's own command does. */
export function fixtureTokenVisibility(id: string, visibility: Visibility): Scene {
  const token = scene().tokens.find((candidate) => candidate.id === id);
  if (token === undefined) {
    throw new Error(`no token ${id} in the scene`);
  }
  token.visibility = visibility;
  return fixtureScene();
}

export function fixturePlace(entry: EntryDocument, col: number, row: number): Scene {
  const campaign = session();
  const token: Token = {
    id: `tok-${campaign.nextToken}`,
    name: entry.name,
    label: initials(entry.name),
    col,
    row,
    facing: 0,
    entry: entry.id,
    visibility: "party",
  };
  campaign.nextToken += 1;
  scene().tokens.push(token);
  return fixtureScene();
}

export function fixtureRemoveToken(id: string): Scene {
  const current = scene();
  current.tokens = current.tokens.filter((token) => token.id !== id);
  return fixtureScene();
}

export function fixtureAddStroke(stroke: Stroke): Scene {
  scene().strokes.push(asAdded(stroke));
  return fixtureScene();
}

export function fixtureUndoStroke(): Scene {
  scene().strokes.pop();
  return fixtureScene();
}

export function fixtureSetMap(map: MapImage | null): Scene {
  scene().map = map;
  return fixtureScene();
}

export function fixtureSetDisplay(display: HeightDisplay): Scene {
  scene().display = display;
  return fixtureScene();
}

export function fixtureSetThresholdState(edge: Edge, state: PlayState): Scene {
  const current = scene();
  const same = (candidate: Edge): boolean =>
    candidate.col === edge.col && candidate.row === edge.row && candidate.side === edge.side;
  const entry = current.play.find((candidate) => same(candidate.edge));
  if (entry === undefined) {
    current.play.push({ edge, state });
  } else {
    entry.state = state;
  }
  return fixtureScene();
}

export function fixtureRemoveStroke(index: number): Scene {
  const current = scene();
  if (index < 0 || index >= current.strokes.length) {
    throw new Error(`no stroke ${index} in the scene`);
  }
  current.strokes.splice(index, 1);
  return fixtureScene();
}

// ── Inside ──

function session(): Campaign {
  const campaign = open === undefined ? undefined : campaigns.get(open);
  if (campaign === undefined) {
    throw new Error("no campaign is open in the fixture");
  }
  return campaign;
}

function scene(): Scene {
  const campaign = session();
  const current = campaign.scenes.get(campaign.current);
  if (current === undefined) {
    throw new Error(`no scene ${campaign.current} in the fixture`);
  }
  return current;
}

// A campaign goes under `root` by its name as a slug, made unique by a
// number, and starts on its tavern, as the core's does.
function create(name: string, root: string): Campaign {
  const base = slug(name);
  let path = `${root}/${base}`;
  for (let n = 2; campaigns.has(path); n += 1) {
    path = `${root}/${base}-${n}`;
  }
  const campaign: Campaign = {
    summary: { name, system: "5e", version: "2024", path },
    scenes: new Map([["tavern", tavern()]]),
    current: "tavern",
    nextToken: 1,
  };
  campaigns.set(path, campaign);
  return campaign;
}

function addScene(campaign: Campaign, name: string, strokes: Stroke[]): void {
  const base = slug(name);
  let id = base;
  for (let n = 2; campaign.scenes.has(id); n += 1) {
    id = `${base}-${n}`;
  }
  campaign.scenes.set(id, { ...blank(id, name), strokes: strokes.map(asAdded) });
  campaign.current = id;
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
    // The bundled tavern picture, twenty by fifteen cells at fifty pixels.
    map: {
      url: new URL("../../src-tauri/resources/example/tavern.svg", import.meta.url).href,
      width: 1000,
      height: 750,
    },
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
