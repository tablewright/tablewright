/** The one build-time dev/prod switch for the TS layer, defined by vite.config.ts. */
declare const __DEV_BUILD__: boolean;

interface Window {
  /** Set by dev builds: a read-only view of the scene for end-to-end tests. */
  __tablewright?: import("./board-host.js").BoardDebug;
  /** Set by dev builds when the page is opened with `?perf=<scenario>`. */
  __tablewrightPerf?: Promise<import("./dev/perf-probe.js").PerfResult>;
}

/** What the dev-only search probe resolves to: the core's answer plus the webview round trip. */
type SearchProbe = import("@tablewright/schema").SearchResponse & { roundTripMs: number };

interface Window {
  /** Set by dev builds inside a Tauri window: try the search command from the console. */
  __tablewrightSearch?: (
    query: string,
    viewer?: import("@tablewright/schema").Visibility,
    limit?: number | null
  ) => Promise<SearchProbe>;
}
