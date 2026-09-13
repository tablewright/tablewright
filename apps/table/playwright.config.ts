// End-to-end tests for the Table frontend in real browsers. Chromium is the
// engine the Windows app runs on; WebKit stands in for the Safari-class
// engines of macOS and Linux, which no machine here can test otherwise.
// Every test records a video, so a run leaves artifacts a person can watch.

import { defineConfig } from "@playwright/test";

const PORT = 1422;
const isCi = process.env["CI"] !== undefined;

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.e2e\.ts/,
  outputDir: "./test-results",
  // Stories share nothing, so CI runs them side by side. On a desk, one at
  // a time: a headless browser draws the board in software, on the
  // processor, and two or more at once take the whole machine.
  workers: isCi ? undefined : 1,
  // A story strings many outcomes on one page, headless browsers draw the
  // board in software, and a run on a desk is held to a quarter of the
  // machine (tools/capped.ts), where the slowest story takes about three
  // minutes. So the waits are generous: ten minutes for a story, twice
  // the default for a check. An action that finds nothing still gives up
  // after twenty seconds.
  timeout: 600_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "./playwright-report" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 20_000,
    // Off while the PoC iterates fast; every recording is encoded in software.
    // Back on, at least for failures, once past the PoC.
    video: "off",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Stories are about what the table does, not about the wordmark drawing
    // itself, which would otherwise cost every story nearly two seconds on a
    // run already held to a quarter of the machine. Reduced motion is a real
    // setting a person can choose, so this is a path the app supports rather
    // than one kept for tests.
    contextOptions: { reducedMotion: "reduce" },
  },
  webServer: {
    command: `bunx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCi,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // Runners without a GPU only get WebGL through SwiftShader, which
        // Chromium refuses unless asked.
        launchOptions: { args: isCi ? ["--enable-unsafe-swiftshader"] : [] },
      },
      testIgnore: /perf\.e2e\.ts/,
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      testIgnore: /perf\.e2e\.ts/,
    },
    {
      // Frame times need the machine's GPU. Playwright's bundled headless
      // shell has no GPU access; the installed Chrome in new headless mode
      // does, and it is present on hosted runners as well.
      name: "perf",
      testMatch: /perf\.e2e\.ts/,
      use: {
        browserName: "chromium",
        channel: "chrome",
        launchOptions: { args: isCi ? ["--enable-unsafe-swiftshader"] : [] },
      },
    },
  ],
});
