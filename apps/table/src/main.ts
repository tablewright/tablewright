import "@tablewright/ui/theme.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BoardStage,
  REFERENCE_SCENES,
  gridRuleOf,
  readBoardTheme,
  signed,
  type DrawTool,
  type PlayTool,
  type RulerMode,
  type ThresholdEdge,
} from "@tablewright/board";
import { commands } from "@tablewright/schema";
import type {
  CampaignSummary,
  CommandError,
  Edge,
  HeightDisplay,
  MapImage,
  PlayState,
  Scene,
  SceneSummary,
  Stroke,
  SystemManifest,
  Visibility,
} from "@tablewright/schema";
import "@tablewright/ui";
import type { EntryDocument, Searcher, SpotlightHit } from "@tablewright/ui";
import { BoardHost, type CellReadout } from "./board-host.js";
import { documentOf } from "./entry-document.js";

const host = document.getElementById("board");
const openButton = document.getElementById("open-map");
const campaignsButton = document.getElementById("campaigns");
const toolRail = document.querySelector("tw-tool-rail");
const sceneChrome = document.querySelector<HTMLElement>(".chrome");
const dmChrome = document.getElementById("dm-chrome");
const roleLabel = document.getElementById("role");
const searchButton = document.getElementById("search");
const spotlight = document.querySelector("tw-spotlight");
const shares = document.querySelector("tw-share-tray");
const entryView = document.querySelector("tw-entry-view");
const scenesTab = document.querySelector("tw-scenes");
const intro = document.querySelector("tw-campaigns");
const dashAsk = document.querySelector("tw-dash-ask");
if (
  host === null ||
  openButton === null ||
  campaignsButton === null ||
  toolRail === null ||
  sceneChrome === null ||
  dmChrome === null ||
  roleLabel === null ||
  searchButton === null ||
  spotlight === null ||
  shares === null ||
  entryView === null ||
  scenesTab === null ||
  intro === null ||
  dashAsk === null
) {
  throw new Error(
    "index.html must contain #board, #open-map, #campaigns, .chrome, #dm-chrome, #role, #search, <tw-scenes>, <tw-campaigns>, <tw-tool-rail>, <tw-spotlight>, <tw-share-tray>, <tw-dash-ask>, and <tw-entry-view>"
  );
}

// The page's own title; the campaign's name goes before it, and a player's
// page says whose view it is after.
const TITLE = document.title;

// What the board shows under the intro: nothing to select, so no key moves
// anything while a campaign is being chosen.
const NO_SCENE: Scene = {
  id: "",
  name: "",
  grid: { cell_size: 50, origin_x: 0, origin_y: 0, cols: 20, rows: 15 },
  map: null,
  tokens: [],
  strokes: [],
  display: { mode: "shaded", strength: 80 },
  play: [],
  next_token: 1,
};

// Errors are named states on screen: what went wrong, and what to do.
function showNotice(message: string, level: "error" | "fatal" | "info" = "error"): void {
  document.querySelector(".notice")?.remove();
  const notice = document.createElement("p");
  notice.className = "notice";
  notice.dataset["level"] = level;
  notice.textContent = level === "fatal" ? message : `${message} Click to dismiss.`;
  if (level !== "fatal") {
    notice.addEventListener("click", () => notice.remove(), { once: true });
  }
  document.body.append(notice);
}

// What the tool is over, in words: the ground state, the height the rules
// give the cell, and whether a level change was painted there.
function describeCell(readout: CellReadout): string {
  if (readout.ground === "void") {
    return "Void: outside the scene";
  }
  const height = readout.height === 0 ? "ground level" : `${signed(Math.round(readout.height))} ft`;
  return `${readout.ground} · ${height}${readout.isLevelChange ? " · level change" : ""}`;
}

// What a tap does to a threshold in Play: a door opens or shuts, a locked
// one says so, a large window is smashed through (an action, not a step),
// a small one is sight only, and a secret door worked is revealed, shut.
// Either a state for the scene, or words for the DM.
function workThreshold(threshold: ThresholdEdge): { state: PlayState } | { notice: string } {
  if (threshold.threshold === "arch") {
    return { notice: "An arch: always open." };
  }
  if (threshold.state === "secret") {
    return { state: "closed" };
  }
  if (threshold.threshold === "window" || threshold.threshold === "frosted") {
    if (threshold.state === "smashed") {
      return { notice: "Smashed: the way through is open." };
    }
    if (threshold.size !== "large") {
      return { notice: "Too small to pass: sight only." };
    }
    return { state: "smashed" };
  }
  switch (threshold.state) {
    case "open":
      return { state: "closed" };
    case "locked":
      return { notice: "Locked: a key, a spell, or the DM's word." };
    default:
      return { state: "open" };
  }
}

// A scene keeps its picture by a path within the campaign, which the
// webview reaches through the asset protocol from the campaign's folder, or
// an address the page loads as it is. Only a Tauri window has the protocol;
// the plain page takes every url as it comes.
function mapUrlOf(map: MapImage | null, campaignPath: string | undefined): string | undefined {
  if (map === null) {
    return undefined;
  }
  // A scheme of two letters or more: http, asset, data, file. One letter is
  // a Windows drive, which is a path.
  const isAddress = /^[a-z][a-z0-9+.-]+:/i.test(map.url);
  if (isAddress || campaignPath === undefined || !("__TAURI_INTERNALS__" in window)) {
    return map.url;
  }
  return convertFileSrc(`${campaignPath}/${map.url}`);
}

// A folder the DM chooses: where a new campaign goes, or a campaign kept
// elsewhere. Only the desktop shell has the dialog.
async function pickFolder(title: string): Promise<string | null> {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error("choosing a folder needs the desktop app");
  }
  const picked = await open({ directory: true, multiple: false, title });
  return typeof picked === "string" ? picked : null;
}

// Opening a picture gives it to the scene on show, sized as it loaded.
async function openMap(board: BoardHost, core: Core, show: (scene: Scene) => void): Promise<void> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Map images", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }],
  });
  if (path === null) {
    return;
  }
  try {
    const size = await board.loadMap(convertFileSrc(path));
    show(await core.setMap({ url: path, width: size.width, height: size.height }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    showNotice(`Could not load ${path}: ${reason}. Use a PNG, JPEG, WebP, or SVG image.`);
  }
}

// The query string can put another map on the board for a look, seed
// tokens, and start a performance probe: ?map=<url>&tokens=<count>&perf=
// <scenario>. The scene's own picture is the fixture's business; a map
// named here is shown over it and not kept. One that fails to load is a
// notice, not a failure of the board.
async function loadDevFixture(board: BoardHost, host: HTMLElement): Promise<void> {
  const { SCENARIOS, runPerfProbe } = await import("./dev/perf-probe.js");
  const params = new URLSearchParams(window.location.search);
  const perf = params.get("perf");
  const scenario =
    perf !== null && perf in SCENARIOS ? (perf as keyof typeof SCENARIOS) : undefined;
  const preset = scenario === undefined ? undefined : SCENARIOS[scenario];
  const url = params.get("map") ?? preset?.map;
  if (url !== undefined) {
    try {
      await board.loadMap(url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      showNotice(`Could not load the dev map ${url}: ${reason}.`);
    }
  }
  const count = Number(params.get("tokens") ?? preset?.tokens);
  if (Number.isInteger(count) && count > 0) {
    board.seedTokens(count);
  }
  if (scenario !== undefined) {
    const debug = board.debug();
    window.__tablewrightPerf = runPerfProbe(host, scenario, () => debug.framesDrawn());
  }
}

// The core behind the panels. In a Tauri window it is one typed call away;
// under plain Vite it is the dev fixture, so everything can be driven in a
// browser and by Playwright without a core.
// The rule version the box folds to, until character sheets bring each
// person their own (design.md §3 "Two rule versions"). 2024 is what shipped
// first, not a preference; the page's own rail turns any thing to the other.
const VERSION = "2024";

// Whose view this page is (design.md §6): the Tauri window is the DM's; the
// same page served without Tauri is the player view, at the party tier with
// no DM chrome. Under plain Vite, `?role=dm` keeps the DM's view reachable
// for Playwright and for looking at it in a browser.
const VIEWER: Visibility = whoseView();

function whoseView(): Visibility {
  if ("__TAURI_INTERNALS__" in window) {
    return "dm";
  }
  if (__DEV_BUILD__ && new URLSearchParams(window.location.search).get("role") === "dm") {
    return "dm";
  }
  return "party";
}

interface Core {
  search: Searcher;
  /** The system the compendium was seeded for, or null when the seeder had none. */
  system: () => Promise<SystemManifest | null>;
  /** Facet name to the text values the compendium holds, for the tray's chips. */
  facetValues: () => Promise<Record<string, string[]>>;
  /** One entry; with a version, the same thing in that rule version when it exists. */
  entry: (id: string, version?: string) => Promise<EntryDocument>;
  /** Every campaign the app knows: under the home, and opened from elsewhere. */
  listCampaigns: () => Promise<CampaignSummary[]>;
  /** The campaign at the table, or null when the intro is where the table is. */
  currentCampaign: () => Promise<CampaignSummary | null>;
  openCampaign: (path: string) => Promise<CampaignSummary>;
  /** A new campaign under the home, or under `location` when the DM chose a folder. */
  createCampaign: (name: string, location: string | null) => Promise<CampaignSummary>;
  closeCampaign: () => Promise<void>;
  scene: () => Promise<Scene>;
  moveToken: (id: string, col: number, row: number, facing: number) => Promise<Scene>;
  placeEntry: (entry: EntryDocument, col: number, row: number) => Promise<Scene>;
  addStroke: (stroke: Stroke) => Promise<Scene>;
  undoStroke: () => Promise<Scene>;
  removeStroke: (index: number) => Promise<Scene>;
  setThresholdState: (edge: Edge, state: PlayState) => Promise<Scene>;
  setMap: (map: MapImage | null) => Promise<Scene>;
  /** How the scene shows its heights: the mode and the overlay's strength. */
  setDisplay: (display: HeightDisplay) => Promise<Scene>;
  listScenes: () => Promise<SceneSummary[]>;
  openScene: (id: string) => Promise<Scene>;
  createScene: (name: string, strokes: Stroke[]) => Promise<Scene>;
}

function connectCore(): Core {
  if (!("__TAURI_INTERNALS__" in window)) {
    if (__DEV_BUILD__) {
      // Loaded now, not on the first keystroke, so the readout measures the
      // panel rather than the module import.
      const fixture = import("./dev/search-fixture.js");
      const scenes = import("./dev/campaign-fixture.js");
      return {
        search: async (query, filters) =>
          (await fixture).fixtureSearcher(query, filters, VERSION, VIEWER),
        system: async () => (await fixture).fixtureSystem,
        facetValues: async () => (await fixture).fixtureFacetValues,
        entry: async (id, version) => {
          const found = (await fixture).fixtureEntry(id, version, VIEWER);
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
    const unconnected = async () => {
      throw new Error("No core is connected to this page.");
    };
    return {
      search: unconnected,
      system: unconnected,
      facetValues: unconnected,
      entry: unconnected,
      listCampaigns: unconnected,
      currentCampaign: unconnected,
      openCampaign: unconnected,
      createCampaign: unconnected,
      closeCampaign: unconnected,
      scene: unconnected,
      moveToken: unconnected,
      placeEntry: unconnected,
      addStroke: unconnected,
      undoStroke: unconnected,
      removeStroke: unconnected,
      setThresholdState: unconnected,
      setMap: unconnected,
      setDisplay: unconnected,
      listScenes: unconnected,
      openScene: unconnected,
      createScene: unconnected,
    };
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
      const data = unwrap(await commands.search(query, VIEWER, null, filters, VERSION));
      return {
        hits: data.hits,
        elapsedUs: data.elapsed_us,
        catalogueSize: data.catalogue_size,
        understood: data.understood,
      };
    },
    system: async () => unwrap(await commands.system()),
    facetValues: async () => unwrap(await commands.facetValues()),
    entry: async (id, version) =>
      documentOf(unwrap(await commands.getEntry(id, VIEWER, version ?? null))),
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

// A console seam for measuring the command surface without the panel:
// window.__tablewrightSearch("fire bolt") resolves to the hits, the core's
// own time, and the round trip through the webview. Only in a Tauri window;
// the plain Vite page has no core behind it.
function exposeSearchProbe(): void {
  window.__tablewrightSearch = async (query: string, viewer: Visibility = "dm", limit = null) => {
    const started = performance.now();
    const result = await commands.search(query, viewer, limit, null, VERSION);
    const roundTripMs = performance.now() - started;
    if (result.status === "error") {
      throw new Error(`search failed: ${JSON.stringify(result.error)}`);
    }
    return { ...result.data, roundTripMs };
  };
}

// The window starts hidden (tauri.conf.json) and shows only after the board
// has rendered its first frame, so the user never sees an empty frame.
try {
  const stage = await BoardStage.create(host, { background: readBoardTheme(host).ground });
  const board = new BoardHost(stage, host, VIEWER);
  const core = connectCore();
  // Whatever opened last sits on top: the search over the rail, the scene
  // list over the palette. A stacking order is geometry, as the camera's
  // transform is, so it is the one inline style the page writes.
  let topLayer = 200;
  const raise = (element: HTMLElement): void => {
    topLayer += 1;
    element.style.zIndex = String(topLayer);
  };
  // Opening an entry is the same act from the box and from a shared card:
  // the page the desk turns to, until the surfaces exist.
  const openEntry = async (hit: SpotlightHit): Promise<void> => {
    try {
      raise(entryView);
      entryView.show(await core.entry(hit.id));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      showNotice(`Could not open ${hit.name}: ${reason}`);
    }
  };
  // The campaign at the table, whose folder the scene's picture is within.
  let campaign: CampaignSummary | undefined;
  // The board shows the core's scene and asks it to record every gesture.
  // A move the scene refuses is undone by showing the scene as it stands.
  // The scene tab names what is shown and, for the DM, lists the rest.
  let display: HeightDisplay = { mode: "shaded", strength: 80 };
  const showScene = (scene: Scene): void => {
    display = scene.display;
    board.setScene(scene, mapUrlOf(scene.map, campaign?.path));
    scenesTab.current = scene.id;
    toolRail.strokes = scene.strokes;
    toolRail.cellSize = scene.grid.cell_size;
    toolRail.display = scene.display;
  };
  const refreshScenes = async (): Promise<void> => {
    scenesTab.scenes = await core.listScenes();
  };
  scenesTab.canManage = VIEWER === "dm";
  scenesTab.references = REFERENCE_SCENES.map((reference) => reference.name);
  scenesTab.addEventListener("click", () => {
    const chrome = scenesTab.parentElement;
    if (chrome !== null) {
      raise(chrome);
    }
  });
  scenesTab.addEventListener("tw-scene-open", (event) => {
    const { id } = (event as CustomEvent<{ id: string }>).detail;
    void (async () => {
      try {
        showScene(await core.openScene(id));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not open the scene: ${reason}`);
      }
    })();
  });
  // A new scene is blank, or a reference drawing's strokes as the core
  // would take them one by one; either way it opens at once.
  scenesTab.addEventListener("tw-scene-create", (event) => {
    const { name, reference } = (event as CustomEvent<{ name: string; reference?: string }>).detail;
    void (async () => {
      try {
        const drawing = REFERENCE_SCENES.find((candidate) => candidate.name === reference);
        showScene(await core.createScene(name, drawing?.strokes() ?? []));
        await refreshScenes();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not create ${name}: ${reason}`);
      }
    })();
  });
  // The one question a move asks stands in a bar under the board while the
  // token waits at its destination; either answer takes it away.
  board.onDashAsk((ask) => {
    if (ask === undefined) {
      dashAsk.hidden = true;
      return;
    }
    dashAsk.cost = ask.cost;
    dashAsk.left = ask.left;
    dashAsk.unit = ask.unit;
    dashAsk.hidden = false;
  });
  dashAsk.addEventListener("tw-dash", (event) => {
    board.answerDash((event as CustomEvent<{ use: boolean }>).detail.use);
  });
  board.onTokenMove(({ id, cell, facing }) => {
    void (async () => {
      try {
        showScene(await core.moveToken(id, cell.col, cell.row, facing));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not move ${id}: ${reason}`);
        showScene(await core.scene());
      }
    })();
  });
  // The footer's rail turns the page to the same thing in another version.
  entryView.addEventListener("tw-version", (event) => {
    const { id, version } = (event as CustomEvent<{ id: string; version: string }>).detail;
    void (async () => {
      try {
        raise(entryView);
        entryView.show(await core.entry(id, version));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not turn to the ${version} rules: ${reason}`);
      }
    })();
  });
  // Placing stands the creature on the cell under the middle of the view;
  // dragging it to a cell arrives with the desk surfaces.
  entryView.addEventListener("tw-place", (event) => {
    const entry = (event as CustomEvent<EntryDocument>).detail;
    const cell = board.centerCell();
    void (async () => {
      try {
        showScene(await core.placeEntry(entry, cell.col, cell.row));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not place ${entry.name}: ${reason}`);
      }
    })();
  });
  openButton.addEventListener("click", () => void openMap(board, core, showScene));
  // The rail is the DM's hand: an ink held is a pen held, the board draws
  // with it and the tokens go inert; the pen down, the pointer moves
  // tokens again. Every finished stroke is a command to the core, and the
  // record shown is the scene's own.
  toolRail.hidden = VIEWER !== "dm";
  const applyTool = (event: Event): void => {
    const { tool } = (event as CustomEvent<{ tool: DrawTool | undefined }>).detail;
    if (tool !== undefined) {
      raise(toolRail);
    }
    board.setBuildTool(tool);
  };
  const undo = (): void => {
    void (async () => {
      try {
        showScene(await core.undoStroke());
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not undo the stroke: ${reason}`);
      }
    })();
  };
  toolRail.addEventListener("tw-tool", applyTool);
  // Play has two hands, moving and measuring. The rail and the R key swap
  // them, for the DM and for a player, who has no rail.
  let play: PlayTool = "move";
  const setPlay = (tool: PlayTool): void => {
    play = tool;
    board.setPlayTool(tool);
    toolRail.play = tool;
  };
  toolRail.addEventListener("tw-play", (event) => {
    setPlay((event as CustomEvent<{ tool: PlayTool }>).detail.tool);
  });
  toolRail.addEventListener("tw-ruler", (event) => {
    board.setRulerMode((event as CustomEvent<{ mode: RulerMode }>).detail.mode);
  });

  // How the scene shows its heights is the scene's; reading it as numbers is
  // the DM's own, so it is kept here and on the board, never on the scene.
  const setTopology = (on: boolean): void => {
    board.setTopologyView(on);
    toolRail.topology = on;
  };
  toolRail.addEventListener("tw-topology", (event) => {
    setTopology((event as CustomEvent<{ on: boolean }>).detail.on);
  });
  toolRail.addEventListener("tw-undo", undo);
  // A reset is a stroke like any other: everything before it is cleared,
  // and it sits in the history so that taking it back brings the rest back.
  toolRail.addEventListener("tw-reset", () => {
    void (async () => {
      try {
        showScene(await core.addStroke({ ink: "clear", visibility: "party" }));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not reset the drawing: ${reason}`);
      }
    })();
  });
  toolRail.addEventListener("tw-remove", (event) => {
    const { index } = (event as CustomEvent<{ index: number }>).detail;
    void (async () => {
      try {
        showScene(await core.removeStroke(index));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not remove the stroke: ${reason}`);
      }
    })();
  });
  // How the scene shows its heights is the scene's, kept with it.
  toolRail.addEventListener("tw-display", (event) => {
    const change = (event as CustomEvent<Partial<HeightDisplay>>).detail;
    void (async () => {
      try {
        showScene(await core.setDisplay({ ...display, ...change }));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not change the height display: ${reason}`);
      }
    })();
  });
  board.onStroke((stroke) => {
    void (async () => {
      try {
        showScene(await core.addStroke(stroke));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not add the stroke: ${reason}`);
      }
    })();
  });
  board.onHover((readout) => {
    toolRail.readout = readout === undefined ? "" : describeCell(readout);
  });
  // A threshold worked in Play is a state of the scene, not a stroke.
  board.onThreshold((threshold) => {
    const outcome = workThreshold(threshold);
    if ("notice" in outcome) {
      showNotice(outcome.notice, "info");
      return;
    }
    void (async () => {
      try {
        showScene(await core.setThresholdState(threshold.edge, outcome.state));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not work the threshold: ${reason}`);
      }
    })();
  });
  // A player's page has no DM chrome and says whose view it is.
  dmChrome.hidden = VIEWER !== "dm";
  roleLabel.hidden = VIEWER === "dm";
  entryView.viewer = VIEWER;
  spotlight.searcher = core.search;
  spotlight.version = VERSION;
  // The box groups by the system's categories and builds its tray from the
  // system's controls; without a system every kind is its own group and
  // there is no tray, which still reads.
  try {
    spotlight.system = (await core.system()) ?? undefined;
    spotlight.facetValues = await core.facetValues();
    entryView.versions = Object.keys(spotlight.system?.versions ?? {});
    board.setRule(gridRuleOf(spotlight.system));
  } catch (error) {
    showNotice(
      `Could not read the system: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  searchButton.addEventListener("click", () => {
    raise(spotlight);
    spotlight.show();
  });
  spotlight.addEventListener("tw-select", (event) => {
    void openEntry((event as CustomEvent<SpotlightHit>).detail);
  });
  // A share becomes a card on this table; the session message to everyone
  // else arrives with networking (design §6). A share of the entry already
  // open as a page raises no card: the reader has it in front of them.
  spotlight.addEventListener("tw-share", (event) => {
    const hit = (event as CustomEvent<SpotlightHit>).detail;
    if (entryView.open && entryView.entry?.id === hit.id) {
      return;
    }
    raise(shares);
    shares.push(hit, "you");
  });
  shares.addEventListener("tw-open", (event) => {
    void openEntry((event as CustomEvent<SpotlightHit>).detail);
  });
  // Escape peels the layers back one at a time: the shared card, then the
  // search box, then the page. Seen first, before any panel's own handler.
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") {
        return;
      }
      // Inside the filter tray, Escape returns to the input; the tray's own.
      if (
        event
          .composedPath()
          .some((node) => node instanceof Element && node.tagName === "TW-FILTER-TRAY")
      ) {
        return;
      }
      if (shares.length > 0) {
        shares.dismiss();
      } else if (spotlight.open) {
        spotlight.hide();
      } else if (entryView.open) {
        entryView.hide();
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true }
  );
  // A click outside the page closes it, as Escape does, once the box is
  // shut: while the box is open its scrim takes the click and the page
  // stays, so the layers still peel one at a time. The chrome is not
  // outside: its buttons open things.
  window.addEventListener(
    "click",
    (event) => {
      if (!entryView.open || spotlight.open) {
        return;
      }
      const path = event.composedPath();
      if (path.includes(entryView) || path.includes(shares) || path.includes(sceneChrome)) {
        return;
      }
      entryView.hide();
    },
    { capture: true }
  );
  window.addEventListener("keydown", (event) => {
    if (event.key === "o" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void openMap(board, core, showScene);
    }
    // A letter typed into a field is text; the first element on the composed
    // path is the real target, even inside another component.
    const typing = event.composedPath()[0];
    const isTyping =
      typing instanceof HTMLElement &&
      (typing.isContentEditable || typing.matches("input, textarea, select"));
    if (
      (event.key === "r" || event.key === "R") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isTyping
    ) {
      setPlay(play === "ruler" ? "move" : "ruler");
    }
    // The Topology view is the DM's alone: a player has no rail to reach it
    // from, so the key must not reach it either.
    if (
      (event.key === "t" || event.key === "T") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isTyping &&
      VIEWER === "dm"
    ) {
      setTopology(!board.isReadingNumbers);
    }
    // Escape leaves the ruler for Move once nothing is on show: a measure
    // on show takes the press and comes off the board instead. Read from
    // the board, since the ruler hears the key after this handler does.
    if (
      event.key === "Escape" &&
      play === "ruler" &&
      !toolRail.held &&
      !event.defaultPrevented &&
      board.measurement === undefined
    ) {
      setPlay("move");
    }
    if (event.code === "Space" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (spotlight.open) {
        spotlight.hide();
      } else {
        raise(spotlight);
        spotlight.show();
      }
    }
    // Undo is the record's, so only while building; a field keeps its own.
    if (
      event.key === "z" &&
      (event.ctrlKey || event.metaKey) &&
      toolRail.held &&
      !(event.target instanceof HTMLElement && event.target.matches("input, textarea"))
    ) {
      event.preventDefault();
      undo();
    }
  });
  // The campaign at the table. Entering one shows its scenes and the
  // chrome; leaving closes it in the core and shows the intro over an empty
  // board. The window's title says which is open.
  const setTitle = (): void => {
    document.title = [campaign?.name, TITLE, VIEWER === "dm" ? undefined : "Player view"]
      .filter((part) => part !== undefined)
      .join(" · ");
  };
  const showChrome = (shown: boolean): void => {
    sceneChrome.hidden = !shown;
    dmChrome.hidden = !shown || VIEWER !== "dm";
    toolRail.hidden = !shown || VIEWER !== "dm";
  };
  const enterCampaign = async (opened: CampaignSummary): Promise<void> => {
    campaign = opened;
    intro.hidden = true;
    await refreshScenes();
    showScene(await core.scene());
    showChrome(true);
    setTitle();
  };
  const showIntro = async (): Promise<void> => {
    campaign = undefined;
    board.setScene(NO_SCENE, undefined);
    scenesTab.scenes = [];
    toolRail.strokes = [];
    showChrome(false);
    setTitle();
    intro.campaigns = await core.listCampaigns();
    raise(intro);
    intro.hidden = false;
  };
  // The first run makes the example campaign: the tavern with its picture,
  // and the mansion and the hill from their reference drawings, open on
  // the tavern.
  const makeExample = async (): Promise<CampaignSummary> => {
    const made = await core.createCampaign("The Rusty Flagon", null);
    for (const reference of REFERENCE_SCENES) {
      await core.createScene(reference.name, reference.strokes());
    }
    await core.openScene("tavern");
    if ("__TAURI_INTERNALS__" in window) {
      const picture = await resolveResource("resources/example/tavern.svg");
      await core.setMap({ url: picture, width: 1000, height: 750 });
    }
    return made;
  };
  intro.addEventListener("tw-campaign-open", (event) => {
    const { path } = (event as CustomEvent<{ path: string }>).detail;
    void (async () => {
      try {
        await enterCampaign(await core.openCampaign(path));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not open the campaign at ${path}: ${reason}`);
      }
    })();
  });
  // A new campaign goes under the home, or in a folder the DM picks, where
  // it gets a folder of its own named after it.
  intro.addEventListener("tw-campaign-create", (event) => {
    const { name, elsewhere } = (event as CustomEvent<{ name: string; elsewhere: boolean }>).detail;
    void (async () => {
      try {
        const location = elsewhere ? await pickFolder("Where the campaign's folder goes") : null;
        if (elsewhere && location === null) {
          return;
        }
        await enterCampaign(await core.createCampaign(name, location));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not create ${name}: ${reason}`);
      }
    })();
  });
  intro.addEventListener("tw-campaign-browse", () => {
    void (async () => {
      try {
        const path = await pickFolder("Open a campaign folder");
        if (path === null) {
          return;
        }
        await enterCampaign(await core.openCampaign(path));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not open the folder: ${reason}`);
      }
    })();
  });
  campaignsButton.addEventListener("click", () => {
    void (async () => {
      try {
        await core.closeCampaign();
        await showIntro();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not leave the campaign: ${reason}`);
      }
    })();
  });
  // The table starts on the campaign open when the app last closed, else
  // on the intro; the first run makes the example. A player's page has no
  // intro: it waits for the DM's campaign.
  const current = await core.currentCampaign();
  if (current !== null) {
    await enterCampaign(current);
  } else if (VIEWER !== "dm") {
    showChrome(false);
    setTitle();
    showNotice("No campaign is at the table.", "info");
  } else if ((await core.listCampaigns()).length === 0) {
    await enterCampaign(await makeExample());
  } else {
    await showIntro();
  }
  if (__DEV_BUILD__) {
    await loadDevFixture(board, host);
    // Exposed only once the fixture is in, so a test that sees it sees a settled scene.
    window.__tablewright = board.debug();
    if ("__TAURI_INTERNALS__" in window) {
      exposeSearchProbe();
    }
  }
  await stage.firstFrame;
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  showNotice(
    `The board could not start: ${reason}. WebGL is required; check graphics drivers and try again.`,
    "fatal"
  );
}
// Only a Tauri window has a window to show; the same page in a browser tab
// is already visible.
if ("__TAURI_INTERNALS__" in window) {
  await getCurrentWindow().show();
}
