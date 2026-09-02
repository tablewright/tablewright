/** The one build-time dev/prod switch for the TS layer, defined by vite.config.ts. */
declare const __DEV_BUILD__: boolean;

interface Window {
  /** Set by dev builds when the page is opened with `?perf=<scenario>`; read by tools/perf-board.ts. */
  __tablewrightPerf?: Promise<import("./dev/perf-probe.js").PerfResult>;
}
