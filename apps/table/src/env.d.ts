/** The one build-time dev/prod switch for the TS layer, defined by vite.config.ts. */
declare const __DEV_BUILD__: boolean;

interface Window {
  /** Set by dev builds: a read-only view of the scene for end-to-end tests. */
  __tablewright?: import("./board-host.js").BoardDebug;
  /** Set by dev builds when the page is opened with `?perf=<scenario>`. */
  __tablewrightPerf?: Promise<import("./dev/perf-probe.js").PerfResult>;
}
