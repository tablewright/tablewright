import "@tablewright/ui/theme.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { BoardStage, readBoardTheme } from "@tablewright/board";
import { commands } from "@tablewright/schema";
import type { Visibility } from "@tablewright/schema";
import "@tablewright/ui";
import type { Searcher, SpotlightHit } from "@tablewright/ui";
import { BoardHost } from "./board-host.js";

const host = document.getElementById("board");
const openButton = document.getElementById("open-map");
const searchButton = document.getElementById("search");
const spotlight = document.querySelector("tw-spotlight");
if (host === null || openButton === null || searchButton === null || spotlight === null) {
  throw new Error("index.html must contain #board, #open-map, #search, and <tw-spotlight>");
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

// The search behind the panel. In a Tauri window it is the core, one typed
// call away; under plain Vite it is the dev fixture, so the panel can be
// driven in a browser and by Playwright without a core.
function makeSearcher(): Searcher {
  if (!("__TAURI_INTERNALS__" in window)) {
    if (__DEV_BUILD__) {
      // Loaded now, not on the first keystroke, so the readout measures the
      // panel rather than the module import.
      const fixture = import("./dev/search-fixture.js");
      return async (query) => (await fixture).fixtureSearcher(query);
    }
    return async () => {
      throw new Error("No core is connected to this page.");
    };
  }
  return async (query) => {
    const result = await commands.search(query, "dm", null);
    if (result.status === "error") {
      const error = result.error;
      throw new Error(
        error.kind === "no-compendium" ? "No compendium is installed." : JSON.stringify(error)
      );
    }
    return {
      hits: result.data.hits,
      elapsedUs: result.data.elapsed_us,
      catalogueSize: result.data.catalogue_size,
    };
  };
}

// A console seam for measuring the command surface without the panel:
// window.__tablewrightSearch("fire bolt") resolves to the hits, the core's
// own time, and the round trip through the webview. Only in a Tauri window;
// the plain Vite page has no core behind it.
function exposeSearchProbe(): void {
  window.__tablewrightSearch = async (query: string, viewer: Visibility = "dm", limit = null) => {
    const started = performance.now();
    const result = await commands.search(query, viewer, limit);
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
  const board = new BoardHost(stage, host);
  openButton.addEventListener("click", () => void openMap(board));
  spotlight.searcher = makeSearcher();
  searchButton.addEventListener("click", () => spotlight.show());
  // Until the compendium view exists, a selection is acknowledged on screen.
  spotlight.addEventListener("tw-select", (event) => {
    const hit = (event as CustomEvent<SpotlightHit>).detail;
    showNotice(`Selected ${hit.name} (${hit.type}, ${hit.id}).`, "info");
  });
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
