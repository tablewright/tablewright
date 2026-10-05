import { commands } from "@tablewright/schema";
import type {
  CampaignSummary,
  CommandError,
  Edge,
  HeightDisplay,
  MapImage,
  PlayState,
  Role,
  Scene,
  SceneSummary,
  Stroke,
  SystemManifest,
  Visibility,
} from "@tablewright/schema";
import type { EntryDocument, Searcher } from "@tablewright/ui";
import { documentOf } from "./entry-document.js";

/** Whether this page is the desktop app's window, with the core, the dialogs and the files behind it. */
export const IS_DESKTOP = "__TAURI_INTERNALS__" in window;

/**
 * The rule version the box folds to, until character sheets bring each
 * person their own (design.md §3 "Two rule versions"). 2024 is what shipped
 * first, not a preference; the page's own rail turns any thing to the other.
 */
export const VERSION = "2024";

/** What the shell asks of the core, whichever one is behind the page. */
export interface Core {
  search: Searcher;
  // Who may do what at this table: the app's own rules under the campaign's.
  permissions: () => Promise<Record<string, Role>>;
  system: () => Promise<SystemManifest | null>;
  facetValues: () => Promise<Record<string, string[]>>;
  // One entry; with a version, the same thing in that rule version when it exists.
  entry: (id: string, version?: string) => Promise<EntryDocument>;
  listCampaigns: () => Promise<CampaignSummary[]>;
  currentCampaign: () => Promise<CampaignSummary | null>;
  openCampaign: (path: string) => Promise<CampaignSummary>;
  // A new campaign under the home, or under `location` when the DM chose a folder.
  createCampaign: (name: string, location: string | null) => Promise<CampaignSummary>;
  closeCampaign: () => Promise<void>;
  scene: () => Promise<Scene>;
  moveToken: (id: string, col: number, row: number, facing: number) => Promise<Scene>;
  setTokenVisibility: (id: string, visibility: Visibility) => Promise<Scene>;
  removeToken: (id: string) => Promise<Scene>;
  placeEntry: (entry: EntryDocument, col: number, row: number) => Promise<Scene>;
  addStroke: (stroke: Stroke) => Promise<Scene>;
  undoStroke: () => Promise<Scene>;
  removeStroke: (index: number) => Promise<Scene>;
  setThresholdState: (edge: Edge, state: PlayState) => Promise<Scene>;
  setMap: (map: MapImage | null) => Promise<Scene>;
  setDisplay: (display: HeightDisplay) => Promise<Scene>;
  listScenes: () => Promise<SceneSummary[]>;
  openScene: (id: string) => Promise<Scene>;
  createScene: (name: string, strokes: Stroke[]) => Promise<Scene>;
}

/**
 * The core behind the panels. In a Tauri window it is one typed call away;
 * under plain Vite it is the dev fixture, so everything can be driven in a
 * browser and by Playwright without a core. `viewer` is the tier of whoever
 * sits at the page, asked at each search and each entry.
 */
export function connectCore(viewer: () => Visibility): Core {
  if (!IS_DESKTOP) {
    if (__DEV_BUILD__) {
      // Loaded now, not on the first keystroke, so the readout measures the
      // panel rather than the module import.
      const fixture = import("../dev/search-fixture.js");
      const scenes = import("../dev/campaign-fixture.js");
      return {
        search: async (query, filters) =>
          (await fixture).fixtureSearcher(query, filters, VERSION, viewer()),
        // The stand-in reads the roles the core would give, written out of
        // the same file by `bun run --cwd apps/table seed`.
        permissions: async () =>
          (await import("../dev/roles.json")).default as Record<string, Role>,
        system: async () => (await fixture).fixtureSystem,
        facetValues: async () => (await fixture).fixtureFacetValues,
        entry: async (id, version) => {
          const found = (await fixture).fixtureEntry(id, version, viewer());
          if (found === undefined) {
            throw new Error(`No entry ${id} in the fixture.`);
          }
          return found;
        },
        listCampaigns: async () => (await scenes).fixtureListCampaigns(),
        currentCampaign: async () => (await scenes).fixtureCurrentCampaign(),
        openCampaign: async (path) => (await scenes).fixtureOpenCampaign(path),
        createCampaign: async (name, location) =>
          (await scenes).fixtureCreateCampaign(name, location),
        closeCampaign: async () => (await scenes).fixtureCloseCampaign(),
        scene: async () => (await scenes).fixtureScene(),
        moveToken: async (id, col, row, facing) =>
          (await scenes).fixtureMoveToken(id, col, row, facing),
        setTokenVisibility: async (id, visibility) =>
          (await scenes).fixtureTokenVisibility(id, visibility),
        removeToken: async (id) => (await scenes).fixtureRemoveToken(id),
        placeEntry: async (entry, col, row) => (await scenes).fixturePlace(entry, col, row),
        addStroke: async (stroke) => (await scenes).fixtureAddStroke(stroke),
        undoStroke: async () => (await scenes).fixtureUndoStroke(),
        removeStroke: async (index) => (await scenes).fixtureRemoveStroke(index),
        setThresholdState: async (edge, state) =>
          (await scenes).fixtureSetThresholdState(edge, state),
        setMap: async (map) => (await scenes).fixtureSetMap(map),
        setDisplay: async (display) => (await scenes).fixtureSetDisplay(display),
        listScenes: async () => (await scenes).fixtureListScenes(),
        openScene: async (id) => (await scenes).fixtureOpenScene(id),
        createScene: async (name, strokes) => (await scenes).fixtureCreateScene(name, strokes),
      };
    }
    // A page with no core behind it: whatever is asked of it says so.
    return new Proxy({} as Core, {
      get: () => async () => {
        throw new Error("No core is connected to this page.");
      },
    });
  }
  const unwrap = <T>(
    result: { status: "ok"; data: T } | { status: "error"; error: CommandError }
  ) => {
    if (result.status === "error") {
      throw new Error(describe(result.error));
    }
    return result.data;
  };
  return {
    search: async (query, filters) => {
      const data = unwrap(await commands.search(query, viewer(), null, filters, VERSION));
      return {
        hits: data.hits,
        elapsedUs: data.elapsed_us,
        catalogueSize: data.catalogue_size,
        understood: data.understood,
      };
    },
    permissions: async () => unwrap(await commands.permissions()),
    system: async () => unwrap(await commands.system()),
    facetValues: async () => unwrap(await commands.facetValues()),
    entry: async (id, version) =>
      documentOf(unwrap(await commands.getEntry(id, viewer(), version ?? null))),
    listCampaigns: async () => unwrap(await commands.listCampaigns()),
    currentCampaign: async () => unwrap(await commands.currentCampaign()),
    openCampaign: async (path) => unwrap(await commands.openCampaign(path)),
    createCampaign: async (name, location) => unwrap(await commands.createCampaign(name, location)),
    closeCampaign: async () => {
      unwrap(await commands.closeCampaign());
    },
    scene: async () => unwrap(await commands.getScene()),
    moveToken: async (id, col, row, facing) =>
      unwrap(await commands.moveToken(id, col, row, facing)),
    setTokenVisibility: async (id, visibility) =>
      unwrap(await commands.setTokenVisibility(id, visibility)),
    removeToken: async (id) => unwrap(await commands.removeToken(id)),
    placeEntry: async (entry, col, row) => unwrap(await commands.placeEntry(entry.id, col, row)),
    addStroke: async (stroke) => unwrap(await commands.addStroke(stroke)),
    undoStroke: async () => unwrap(await commands.undoStroke()),
    removeStroke: async (index) => unwrap(await commands.removeStroke(index)),
    setThresholdState: async (edge, state) => unwrap(await commands.setThresholdState(edge, state)),
    setMap: async (map) => unwrap(await commands.setMap(map)),
    setDisplay: async (display) => unwrap(await commands.setDisplay(display)),
    listScenes: async () => unwrap(await commands.listScenes()),
    openScene: async (id) => unwrap(await commands.openScene(id)),
    createScene: async (name, strokes) => unwrap(await commands.createScene(name, strokes)),
  };
}

function describe(error: { kind: string }): string {
  switch (error.kind) {
    case "no-campaign":
      return "No campaign is open.";
    case "no-compendium":
      return "No compendium could be opened: neither the library nor the campaign's own.";
    case "campaign":
      return `The campaign folder refused: ${(error as { message?: string }).message ?? "unknown"}.`;
    case "not-found":
      return "That entry is not in the compendium.";
    case "scene":
      return `The scene refused: ${(error as { message?: string }).message ?? "unknown"}.`;
    default:
      return JSON.stringify(error);
  }
}
