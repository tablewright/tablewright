import "@tablewright/ui/theme.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { BoardStage, mansionStrokes, readBoardTheme } from "@tablewright/board";
import { commands } from "@tablewright/schema";
import type { CommandError, Scene, Stroke, SystemManifest, Visibility } from "@tablewright/schema";
import "@tablewright/ui";
import type { EntryDocument, Searcher, SpotlightHit } from "@tablewright/ui";
import { BoardHost } from "./board-host.js";

const host = document.getElementById("board");
const openButton = document.getElementById("open-map");
const mansionButton = document.getElementById("draw-mansion");
const undoButton = document.getElementById("undo-stroke");
const dmChrome = document.getElementById("dm-chrome");
const roleLabel = document.getElementById("role");
const searchButton = document.getElementById("search");
const spotlight = document.querySelector("tw-spotlight");
const shares = document.querySelector("tw-share-tray");
const entryView = document.querySelector("tw-entry-view");
const sceneName = document.querySelector("#scene .scene-name");
if (
  host === null ||
  openButton === null ||
  mansionButton === null ||
  undoButton === null ||
  dmChrome === null ||
  roleLabel === null ||
  searchButton === null ||
  spotlight === null ||
  shares === null ||
  entryView === null ||
  sceneName === null
) {
  throw new Error(
    "index.html must contain #board, #open-map, #draw-mansion, #undo-stroke, #dm-chrome, #role, #search, #scene, <tw-spotlight>, <tw-share-tray>, and <tw-entry-view>"
  );
}

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

async function openMap(board: BoardHost): Promise<void> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Map images", extensions: ["png", "jpg", "jpeg", "webp", "svg"] }],
  });
  if (path === null) {
    return;
  }
  try {
    await board.loadMap(convertFileSrc(path));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    showNotice(`Could not load ${path}: ${reason}. Use a PNG, JPEG, WebP, or SVG image.`);
  }
}

// A fixture so the board has a map to show without hunting for one. The query
// string can swap the map, seed tokens, and start a performance probe:
// ?map=<url>&tokens=<count>&perf=<scenario>. A fixture that fails to load is a
// notice, not a failure of the board.
async function loadDevFixture(board: BoardHost, host: HTMLElement): Promise<void> {
  const { SCENARIOS, runPerfProbe } = await import("./dev/perf-probe.js");
  const params = new URLSearchParams(window.location.search);
  const perf = params.get("perf");
  const scenario =
    perf !== null && perf in SCENARIOS ? (perf as keyof typeof SCENARIOS) : undefined;
  const preset = scenario === undefined ? undefined : SCENARIOS[scenario];
  const url =
    params.get("map") ?? preset?.map ?? new URL("../dev/tavern.svg", import.meta.url).href;
  try {
    await board.loadMap(url);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    showNotice(`Could not load the dev map ${url}: ${reason}.`);
  }
  const count = Number(params.get("tokens") ?? preset?.tokens);
  if (Number.isInteger(count) && count > 0) {
    board.seedTokens(count);
  }
  if (scenario !== undefined) {
    window.__tablewrightPerf = runPerfProbe(host, scenario);
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
  scene: () => Promise<Scene>;
  moveToken: (id: string, col: number, row: number, facing: number) => Promise<Scene>;
  placeEntry: (entry: EntryDocument, col: number, row: number) => Promise<Scene>;
  addStroke: (stroke: Stroke) => Promise<Scene>;
  undoStroke: () => Promise<Scene>;
}

function connectCore(): Core {
  if (!("__TAURI_INTERNALS__" in window)) {
    if (__DEV_BUILD__) {
      // Loaded now, not on the first keystroke, so the readout measures the
      // panel rather than the module import.
      const fixture = import("./dev/search-fixture.js");
      const scenes = import("./dev/scene-fixture.js");
      const system = import("./dev/system-fixture.js");
      return {
        search: async (query, filters) =>
          (await fixture).fixtureSearcher(query, filters, VERSION, VIEWER),
        system: async () => (await system).fixtureSystem,
        facetValues: async () => (await system).fixtureFacetValues,
        entry: async (id, version) => {
          const found = (await fixture).fixtureEntry(id, version, VIEWER);
          if (found === undefined) {
            throw new Error(`No entry ${id} in the fixture.`);
          }
          return found;
        },
        scene: async () => (await scenes).fixtureScene(),
        moveToken: async (id, col, row, facing) =>
          (await scenes).fixtureMoveToken(id, col, row, facing),
        placeEntry: async (entry, col, row) => (await scenes).fixturePlace(entry, col, row),
        addStroke: async (stroke) => (await scenes).fixtureAddStroke(stroke),
        undoStroke: async () => (await scenes).fixtureUndoStroke(),
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
      scene: unconnected,
      moveToken: unconnected,
      placeEntry: unconnected,
      addStroke: unconnected,
      undoStroke: unconnected,
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
    entry: async (id, version) => {
      const { type, name, source, tags, body, html, sections, ...rest } = unwrap(
        await commands.getEntry(id, VIEWER, version ?? null)
      );
      return {
        id: rest.id,
        type,
        name,
        source,
        version: rest.version ?? "",
        versions: rest.versions ?? [],
        tags,
        body,
        html: html ?? "",
        sections: sections ?? [],
      };
    },
    scene: async () => unwrap(await commands.getScene()),
    moveToken: async (id, col, row, facing) =>
      unwrap(await commands.moveToken(id, col, row, facing)),
    placeEntry: async (entry, col, row) => unwrap(await commands.placeEntry(entry.id, col, row)),
    addStroke: async (stroke) => unwrap(await commands.addStroke(stroke)),
    undoStroke: async () => unwrap(await commands.undoStroke()),
  };
}

function describe(error: { kind: string }): string {
  switch (error.kind) {
    case "no-compendium":
      return "No compendium is installed.";
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
  // Opening an entry is the same act from the box and from a shared card:
  // the page the desk turns to, until the surfaces exist.
  const openEntry = async (hit: SpotlightHit): Promise<void> => {
    try {
      entryView.show(await core.entry(hit.id));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      showNotice(`Could not open ${hit.name}: ${reason}`);
    }
  };
  // The board shows the core's scene and asks it to record every gesture.
  // A move the scene refuses is undone by showing the scene as it stands.
  // The scene tab names what is shown; the DM screen's list comes later.
  const showScene = (scene: Scene): void => {
    board.setScene(scene);
    sceneName.textContent = scene.name;
  };
  showScene(await core.scene());
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
  openButton.addEventListener("click", () => void openMap(board));
  // The mansion is the reference drawing: one stroke at a time through the
  // core, as the drawing tool will send them, so the record is real.
  mansionButton.addEventListener("click", () => {
    void (async () => {
      try {
        let scene = await core.scene();
        for (const stroke of mansionStrokes()) {
          scene = await core.addStroke(stroke);
        }
        showScene(scene);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not draw the mansion: ${reason}`);
      }
    })();
  });
  undoButton.addEventListener("click", () => {
    void (async () => {
      try {
        showScene(await core.undoStroke());
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        showNotice(`Could not undo the stroke: ${reason}`);
      }
    })();
  });
  // A player's page has no DM chrome and says whose view it is.
  dmChrome.hidden = VIEWER !== "dm";
  roleLabel.hidden = VIEWER === "dm";
  if (VIEWER !== "dm") {
    document.title = `${document.title} · Player view`;
  }
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
  } catch (error) {
    showNotice(
      `Could not read the system: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  searchButton.addEventListener("click", () => spotlight.show());
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
  const chrome = document.querySelector(".chrome");
  window.addEventListener(
    "click",
    (event) => {
      if (!entryView.open || spotlight.open) {
        return;
      }
      const path = event.composedPath();
      if (
        path.includes(entryView) ||
        path.includes(shares) ||
        (chrome !== null && path.includes(chrome))
      ) {
        return;
      }
      entryView.hide();
    },
    { capture: true }
  );
  window.addEventListener("keydown", (event) => {
    if (event.key === "o" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void openMap(board);
    }
    if (event.code === "Space" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      spotlight.toggle();
    }
  });
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
