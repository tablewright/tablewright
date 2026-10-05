import { commands } from "@tablewright/schema";
import type { Visibility } from "@tablewright/schema";
import type { BoardHost } from "../host/board-host.js";
import { IS_DESKTOP, VERSION } from "../core/core.js";
import { reasonOf, showNotice } from "../shell/notice.js";
import type { Table } from "../shell/table.js";

// The query string can put another map on the board, seed tokens and start a
// performance probe: ?map=<url>&tokens=<count>&perf=<scenario>. A map named
// here is shown in place of the scene's own and not kept.
async function loadDevFixture(board: BoardHost, host: HTMLElement): Promise<void> {
  const { SCENARIOS, runPerfProbe } = await import("./perf-probe.js");
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
      showNotice(`Could not load the dev map ${url}: ${reasonOf(error)}.`);
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

// A console seam for measuring the command surface without the panel:
// window.__tablewrightSearch("fire bolt") resolves to the hits, the core's
// own time, and the round trip through the webview. Only in a Tauri window;
// the plain Vite page has no core behind it.
function exposeSearchProbe(): void {
  window.__tablewrightSearch = async (query: string, tier: Visibility = "dm", limit = null) => {
    const started = performance.now();
    const result = await commands.search(query, tier, limit, null, VERSION);
    const roundTripMs = performance.now() - started;
    if (result.status === "error") {
      throw new Error(`search failed: ${JSON.stringify(result.error)}`);
    }
    return { ...result.data, roundTripMs };
  };
}

/** What only a dev build has: the query string's fixture, the board's view for the stories, and the search probe. */
export async function wireDev(table: Table): Promise<void> {
  await loadDevFixture(table.board, table.page.host);
  // Exposed only once the fixture is in, so a test that sees it sees a settled scene.
  window.__tablewright = table.board.debug();
  if (IS_DESKTOP) {
    exposeSearchProbe();
  }
}
