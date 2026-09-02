import "@tablewright/ui/theme.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { BoardStage, readBoardTheme } from "@tablewright/board";
import { BoardHost } from "./board-host.js";

const host = document.getElementById("board");
const openButton = document.getElementById("open-map");
if (host === null || openButton === null) {
  throw new Error("index.html must contain #board and #open-map elements");
}

// Errors are named states on screen: what went wrong, and what to do.
function showNotice(message: string, level: "error" | "fatal" = "error"): void {
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

// The window starts hidden (tauri.conf.json) and shows only after the board
// has rendered its first frame, so the user never sees an empty frame.
try {
  const stage = await BoardStage.create(host, { background: readBoardTheme(host).ground });
  const board = new BoardHost(stage, host);
  openButton.addEventListener("click", () => void openMap(board));
  window.addEventListener("keydown", (event) => {
    if (event.key === "o" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void openMap(board);
    }
  });
  if (__DEV_BUILD__) {
    await loadDevFixture(board, host);
    // Exposed only once the fixture is in, so a test that sees it sees a settled scene.
    window.__tablewright = board.debug();
  }
  await stage.firstFrame;
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  showNotice(
    `The board could not start: ${reason}. WebGL is required; check graphics drivers and try again.`,
    "fatal"
  );
}
await getCurrentWindow().show();
